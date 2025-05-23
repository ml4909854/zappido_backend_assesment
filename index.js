// index.js - Complete Backend for Zappio Ride Booking App (No .env version)
const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

// Initialize Express app
const app = express();
const PORT = 3000; // Hardcoded port

// Middleware
app.use(bodyParser.json());
app.use(cors());

// In-memory storage for OTPs
const otpStore = {};

// Mock authentication tokens
const validTokens = ['simple_token_123'];

// Initialize Firebase (using local emulator)
let db;
try {
     admin.initializeApp({
        projectId: 'zappio-mvp-local',
        credential: admin.credential.applicationDefault()
    });
    db = admin.firestore();
    console.log('Firebase initialized in emulator mode');
} catch (error) {
    console.error('Firebase initialization error:', error);
    process.exit(1);
}

// Helper function to generate 4-digit OTP
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * @route POST /send-otp
 * @description Send OTP to phone number
 * @body {string} phoneNumber - User's phone number
 */
app.post('/send-otp', (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        // Validation
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ 
                success: false,
                error: 'Valid phone number is required' 
            });
        }

        // Generate and store OTP
        const otp = generateOTP();
        otpStore[phoneNumber] = {
            otp,
            expiresAt: Date.now() + 300000 // 5 minutes expiry
        };

        console.log(`OTP for ${phoneNumber}: ${otp}`); // Log for testing
        
        res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            otp: otp // Returning OTP for testing purposes
        });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            
        });
    }
});

/**
 * POST /verify-otp
 * Verify OTP and return auth token
 * phoneNumber - User's phone number
 * otp - OTP received by user
 */
app.post('/verify-otp', (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;
        
        // Validation
        if (!phoneNumber || !otp) {
            return res.status(400).json({ 
                success: false,
                error: 'Phone number and OTP are required' 
            });
        }

        // Check OTP existence and match
        const storedOtp = otpStore[phoneNumber];
        if (!storedOtp || storedOtp.otp !== otp) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid OTP' 
            });
        }

        // Check OTP expiry
        if (Date.now() > storedOtp.expiresAt) {
            delete otpStore[phoneNumber]; // Clean up expired OTP
            return res.status(401).json({ 
                success: false,
                error: 'OTP expired' 
            });
        }

        // Generate user ID and token
        const userId = `user_${phoneNumber}`;
        const authToken = 'simple_token_123';
        
        // Clean up OTP after successful verification
        delete otpStore[phoneNumber];

        res.status(200).json({
            success: true,
            userId,
            token: authToken
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// Authentication middleware
function authenticate(req, res, next) {
    const token = req.headers['authorization'];
    
    if (!token || !validTokens.includes(token)) {
        return res.status(401).json({ 
            success: false,
            error: 'Unauthorized: Invalid token' 
        });
    }
    
    next();
}

/**
 *  POST /ride-request
 *  Create a new ride request
 *  Authorization: Bearer <token>

 */
app.post('/ride-request', authenticate, async (req, res) => {
    try {
        const { userId, pickup, drop, timestamp } = req.body;
        
        // Validation
        if (!userId || !pickup || !drop || !timestamp) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        if (typeof pickup !== 'object' || !pickup.lat || !pickup.lng ||
            typeof drop !== 'object' || !drop.lat || !drop.lng) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid location coordinates' 
            });
        }

        
        const rideRequest = {
            userId,
            pickup,
            drop,
            timestamp: new Date(timestamp).toISOString(),
            status: 'requested',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save to Firestore
        const docRef = await db.collection('rideRequests').add(rideRequest);
        
        res.status(201).json({
            success: true,
            message: 'Ride request created successfully',
            rideId: docRef.id,
            ...rideRequest
        });
    } catch (error) {
       
        res.status(500).json({ 
            success: false,
            error: 'Failed to create ride request' ,
            checkError:error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'Endpoint not found' 
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Running in development mode');
});