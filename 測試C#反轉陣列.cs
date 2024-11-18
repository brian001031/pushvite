/******************************************************************************

Welcome to GDB Online.
GDB online is an online compiler and debugger tool for C, C++, Python, Java, PHP, Ruby, Perl,
C#, OCaml, VB, Swift, Pascal, Fortran, Haskell, Objective-C, Assembly, HTML, CSS, JS, SQLite, Prolog.
Code, Compile, Run and Debug online from anywhere in world.

*******************************************************************************/
using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Linq;

class HelloWorld {
    
 public static int[] GetRow(int[,] mat, int rowNumber) 
    => Enumerable.Range(0, mat.GetLength(1))
            .Select(i => mat[rowNumber, i])
            .ToArray();
    
  private static void Xorswap(ref string a ,ref string b){
    //   a ^=b;
    //   b ^=a;
    //   a ^=b;
    
    string tmp;
    tmp = a;
    a = b;
    b =tmp;
    
  }
  
   
  
  struct TestData{
      public int nNum;
      public int nchecknum;
      public string sTest;
  }
    
    
  static void Main() {
	  
	

      
      string[] dinosaurs = { ";1;2;3;4;5;6;7;8;9;10;11;12",
                            "2022;237;238;239;240;241;242;243;244;245;246;247;248",
                            "2023;337;338;339;340;341;342;343;344;345;346;347;348",
                            "2024;437;438;439;440;441;442;443;444;445;446;447;448"};

      Console.WriteLine();
        
      List<List<string>> table = new List<List<string>>();
        
      
        
        
        foreach (string line in dinosaurs)
        {
            table.Add(line.Split(";").ToList());
        }
        
    
        
      
        
        //  foreach(List<string> row in table)
        // {
        //     foreach(string cell in row)
        //     {
              
        //         Console.Write($"{cell} \t");
        //     }
        //     Console.Write("\r\n");
        // }
        
        
        // Console.Write("\r\n");
		
		
        List<TestData> lsDate = new List<TestData>();
		
		int[] nint = {5,1,9,9,10};
		int[] nint2 = {2,20,12,8,7};
		string[] sStr = {"30","25","23","80","10"};
		
		
		
		for (int i = 0; i <5; i++ )
        {
			TestData sDate = new TestData();
			sDate.nNum = nint[i];
			sDate.nchecknum = nint2[i];
			sDate.sTest = sStr[i];
			lsDate.Add(sDate);
        }
		
		lsDate.Sort(delegate (TestData x ,TestData y){
			int ncompare1 = x.nNum.CompareTo(y.nNum);
			if(ncompare1!=0) return ncompare1;
			int ncomparetest = x.sTest.CompareTo(y.sTest);
			if(ncomparetest!=0) return ncomparetest;
			int nchecknum = (-1 * (x.nchecknum.CompareTo(y.nchecknum)));
			return nchecknum;
		});
		
// 		 for (int i = 0; i < lsDate.Count; i++ )
//         {
// 			Console.Write(lsDate[i].nchecknum+ " "+lsDate[i].nNum +"   "+lsDate[i].sTest);
// 			Console.Write("\r\n");
//         }
        
         Console.Write("\r\n");
         
         Console.WriteLine("original twoArray ▼");
  
        int[,] originalArray = new int[3, 4]{ {2,5,55,20},{10,45,5,10 },{ 67,34,56,85} };
        /*method 1 start*/
        int rows = originalArray.GetLength(0); // 0 is first dimension, 1 is 2nd 
                                                      
        int cols = originalArray.GetLength(1);  //dimension of 2d array 
        for (int i = 0; i < rows; i++)
        {
            for (int j = 0; j < cols; j++)
            {
         
              Console.Write("\t" +$"{originalArray[i,j]}" );
            
            }
            Console.Write("\r\n");
        }
        /*method 1 end*/



        /*method 2 start*/
        
        // Console.WriteLine("original twoArray ▼");
        
        //  for (int i = 0; i < twoDArray.GetLength(0); i++ )
        // {
     
        //   Console.WriteLine(string.Join(",", GetRow(twoDArray, i)));
        
        // }
        
        /* convert 翻轉反向)*/
        
        
         
         
        
        // 获取原始数组的行数和列数
     
        
        // 创建一个新的二维数组来存储转置后的结果 (翻轉反向)
       int rowCount = originalArray.GetLength(0);
        int colCount = originalArray.GetLength(1);
        
        
        int[,] reversedArray = new int[rowCount,colCount];
        int[,] rotatedArray_L = new int[colCount, rowCount];
        int[,] rotatedArray_R = new int[colCount, rowCount];
        
        
        
        for (int i = 0; i < rowCount; i++)
        {
            for (int j = 0; j < colCount; j++)
            //   for (int j = colCount -1; j >=0; j--)
            {
               
                // 将 (i, j) 位置的元素旋转90度到 (j, rowCount - 1 - i)
                rotatedArray_R[j, rowCount - 1 - i] = originalArray[i, j];
                
                 rotatedArray_L[j, rowCount - 1 - i] = originalArray[ rowCount - i -1 , colCount -j-1];
                
                 // 将元素放到反向数组的位置
                reversedArray[i, j] = originalArray[rowCount - 1 - i, colCount - 1 - j];
            }
        }
        
        
        
         // 打印旋转后的数组
         
         Console.WriteLine("Rotated Array (右邊 90 degrees clockwise):");
         PrintTable(rotatedArray_R);
         
         Console.WriteLine();
          Console.WriteLine("Rotated Array (左邊 90 degrees clockwise):");
         PrintTable(rotatedArray_L);
                
        Console.Write("\r\n");        
        
        Console.WriteLine("after convert 翻轉反向 ▼");
        PrintTable(reversedArray);
  }
  
  static void PrintTable(int[,] array)
  {
        int rowCount = array.GetLength(0);
        int colCount = array.GetLength(1);

        for (int i = 0; i < rowCount; i++)
        {
            for (int j = 0; j < colCount; j++)
            {
                Console.Write(array[i, j].ToString().PadRight(4));
            }
            Console.WriteLine();
        }
  }
}