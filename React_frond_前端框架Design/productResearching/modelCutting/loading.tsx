import { useState, useEffect } from 'react';

export default function LoadingSpinner () {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '200px' }}>
                <div>
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <div className="text-center mt-2">Loading...</div>
                </div>
            </div>
        );
    }