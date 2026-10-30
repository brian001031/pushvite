const _ = require('lodash');
const nodemailer = require('nodemailer');
const moment = require('moment');
const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();


// Helper function to safely parse JSON array fields
const safeJsonArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
        try {
            const parsed = JSON.parse(v);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

/**
 * Sends a consolidated daily leave notification email to managers.
 */
const sendDailyLeaveNotifications = async () => {
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Running daily leave notification job...`);

    const prisma = prismaHr;

    try {
        // 1. Get all active managers, their authority areas, and emails.
        const managers = await prisma.AbsentManagerRoster.findMany({
            where: { nowIsManager: true },
            select: {
                memberID: true,
                reg_schedulename: true,
                authPosition: true, // This is a JSON array of strings
                regInfo: {
                    select: { memEmail: true }
                }
            }
        });
        console.log (`Found ${managers.length} active managers.`);

        if (!managers.length) {
            console.log("No managers found. Skipping job.");
            return;
        }

        // 2. Define "yesterday" and get all active leave records for that period.

        const activeLeaves = await prisma.AbsentSystemLeaveSortOutAll.findMany({
            where: {
                errorStatusNotify: '4'
            },
            select: {
                employeeNumber: true,
                employeeName: true,
                leaveType: true,
                leaveStartTime: true,
                leaveEndTime: true,
            }
        });

        console.log(`Found ${activeLeaves.length} active leave records in leave apply system.`);

        if (!activeLeaves.length) {
            console.log("No active leave records in leave apply system. Skipping job.");
            return;
        }

        // 3. Get the authPosition for each employee on leave for mapping.
        const onLeaveEmployeeNumbers = [...new Set(typeof activeLeaves === "object" && activeLeaves.map(leave => leave.employeeNumber))];

        // console.log ("typeof activeLeaves: " , typeof activeLeaves , "|  activeLeaves  :" , activeLeaves );
        
        const employeesOnLeave = await prisma.ScheduleRegInfo.findMany({
            where: { memberID: { in: onLeaveEmployeeNumbers } },
            select: {
                memberID: true,
                authPosition: true // This is a single string for employees
            }
        });

        // Create a map for quick lookup: authPosition (string) -> array of leave records
        const leavesByAuthPosition = {};
        for (const leave of activeLeaves) {
            const employee = employeesOnLeave.find(e => e.memberID === leave.employeeNumber);
            if (employee && employee.authPosition) {
                const pos = employee.authPosition;
                if (!leavesByAuthPosition[pos]) {
                    leavesByAuthPosition[pos] = [];
                }
                console.log (`Mapping leave of ${leave.employeeName} (${leave.employeeNumber}) to authPosition ${pos}`);
                leavesByAuthPosition[pos].push(leave);
            }
        }

        
        

        // Also map leaves by employee number for manager-as-applicant lookup
        const leavesByEmployeeNumber = {};
        for (const leave of activeLeaves) {
            const empNum = leave.employeeNumber;
            if (!leavesByEmployeeNumber[empNum]) {
                leavesByEmployeeNumber[empNum] = [];
            }
            leavesByEmployeeNumber[empNum].push(leave);
        }

        // 4. Iterate through managers, aggregate their notifications, and send emails.
        for (const manager of managers) {
            const managerAuths = safeJsonArray(manager.authPosition);
            let leavesForNotification = [];

            // A. Find leaves of subordinates (employees)
            for (const authPos of managerAuths) {
                if (typeof leavesByAuthPosition === "object" && leavesByAuthPosition[authPos]) {
                    leavesForNotification.push(...leavesByAuthPosition[authPos]);
                }
            }

            // B. Find leaves of subordinates (who are also managers)
            const subordinateManagers = managers.filter(potentialSub => {
                if (manager.memberID === potentialSub.memberID) return false;
                const subAuths = safeJsonArray(potentialSub.authPosition);
                // Manager's auths must be a proper superset of the subordinate manager's auths
                return subAuths.length > 0 && 
                       subAuths.every(sa => managerAuths.includes(sa)) &&
                       managerAuths.length > subAuths.length;
            });
            
            for (const subManager of subordinateManagers) {
                if (typeof leavesByEmployeeNumber === "object" && leavesByEmployeeNumber[subManager.memberID]) {
                    leavesForNotification.push(...leavesByEmployeeNumber[subManager.memberID]);
                }
            }
            
            // Remove duplicates and send email
            if (leavesForNotification.length > 0) {
                const uniqueLeaves = _.uniqBy(leavesForNotification, (l) => `${l.employeeNumber}-${l.leaveStartTime}`);
                
                if (manager.regInfo?.memEmail) {
                    await sendEmailToManager(manager.reg_schedulename, manager.regInfo.memEmail, uniqueLeaves);
                    console.log(`Sent daily leave report to ${manager.reg_schedulename} at ${manager.regInfo.memEmail}`);
                } else {
                    console.warn(`Manager ${manager.reg_schedulename} has leaves to be notified but no email address.`);
                }
            }
        }
        console.log("Daily leave notification job finished.");

    } catch (error) {
        console.error("Error running daily leave notification job:", error);
    }
};

/**
 * Sends one email to a manager with a list of leave records.
 * @param {string} managerName - The name of the manager.
 * @param {string} managerEmail - The recipient's email address.
 * @param {Array} leaves - An array of leave record objects.
 */
const sendEmailToManager = async (managerName, managerEmail, leaves) => {
    if (!managerEmail || leaves.length === 0) {
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    });

    const leaveRows = leaves.map(leave => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${leave.employeeName} (${leave.employeeNumber})</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${leave.leaveType}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${moment(leave.leaveStartTime).format('YYYY-MM-DD HH:mm')}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${moment(leave.leaveEndTime).format('YYYY-MM-DD HH:mm')}</td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `"公司請假系統" <${process.env.EMAIL_USER}>`,
        to: managerEmail,
        subject: `[未簽核請假彙總] 您所屬部門同仁請假狀況列表`,
        html: `
            <h3>${managerName} 主管您好，</h3>
            <p>以下是您管理之部門同仁請假狀況列表：</p>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">姓名 (工號)</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">假別</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">開始時間</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">結束時間</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaveRows}
                </tbody>
            </table>
            <hr>
            <p>此為系統自動發送的通知信，請勿直接回覆。</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Successfully sent daily leave report to ${managerName} at ${managerEmail}`);
    } catch (error) {
        console.error(`Failed to send email to ${managerName} at ${managerEmail}:`, error);
    }
};


module.exports = { sendDailyLeaveNotifications };
