#!/usr/bin/env node

/**
 * Test script to verify Firebase authentication setup
 * Run with: node test-auth.js
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Load environment variables
require('dotenv').config();

async function testFirebaseAuth() {
  console.log('🔥 Testing Firebase Authentication Setup...\n');

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCLOUD_PROJECT;
  
  if (!projectId || projectId === 'your-project-id') {
    console.error('❌ ERROR: GOOGLE_CLOUD_PROJECT_ID not set in environment variables');
    console.log('💡 Set your project ID: export GOOGLE_CLOUD_PROJECT_ID=your-firebase-project-id');
    process.exit(1);
  }

  console.log(`📍 Project ID: ${projectId}`);

  try {
    // Test different authentication methods
    const serviceAccount = {
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    };

    let authMethod = 'unknown';
    
    if (serviceAccount.clientEmail && serviceAccount.privateKey) {
      console.log('🔑 Using service account credentials');
      authMethod = 'service-account';
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
    } else {
      console.log('🔑 Using Application Default Credentials (ADC)');
      authMethod = 'adc';
      initializeApp({
        projectId: projectId,
      });
    }

    // Initialize Firestore
    const db = getFirestore();
    console.log('✅ Firebase initialized successfully');

    // Test database connection
    console.log('\n📡 Testing Firestore connection...');
    
    try {
      // Try to read from Firestore
      const testCollection = db.collection('_auth_test');
      await testCollection.limit(1).get();
      console.log('✅ Firestore connection successful');

      // Try to write to Firestore
      const testDoc = testCollection.doc('test');
      await testDoc.set({
        timestamp: new Date(),
        authMethod: authMethod,
        test: 'Firebase authentication working'
      });
      console.log('✅ Firestore write test successful');

      // Clean up test document
      await testDoc.delete();
      console.log('✅ Firestore cleanup successful');

    } catch (firestoreError) {
      console.error('❌ Firestore operation failed:', firestoreError.message);
      
      if (firestoreError.message.includes('permission')) {
        console.log('\n💡 SOLUTION: This is likely a permissions issue.');
        console.log('   Make sure your authentication method has Firestore access:');
        
        if (authMethod === 'adc') {
          console.log('   1. Run: gcloud auth application-default login');
          console.log('   2. Make sure your Google account has Firestore access');
        } else {
          console.log('   1. Check your service account has Firestore Database User role');
          console.log('   2. Verify your credentials are correct');
        }
      }
      
      return false;
    }

    console.log('\n🎉 SUCCESS: Firebase authentication is working correctly!');
    console.log(`   Authentication method: ${authMethod}`);
    console.log(`   Project ID: ${projectId}`);
    
    return true;

  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    
    if (error.message.includes('could not be determined')) {
      console.log('\n💡 SOLUTION: Authentication credentials not found.');
      console.log('   Try one of these methods:');
      console.log('   1. Run: gcloud auth application-default login');
      console.log('   2. Set service account environment variables');
      console.log('   3. Deploy to Google Cloud (automatic authentication)');
    }
    
    return false;
  }
}

// Test Google OAuth setup
function testGoogleOAuth() {
  console.log('\n🔐 Testing Google OAuth Setup...');
  
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId) {
    console.log('⚠️  GOOGLE_CLIENT_ID not set');
    return false;
  }
  
  if (!clientSecret) {
    console.log('⚠️  GOOGLE_CLIENT_SECRET not set');
    return false;
  }
  
  if (!clientId.includes('.apps.googleusercontent.com')) {
    console.log('⚠️  GOOGLE_CLIENT_ID format looks incorrect');
    return false;
  }
  
  console.log('✅ Google OAuth credentials configured');
  console.log(`   Client ID: ${clientId.substring(0, 20)}...`);
  
  return true;
}

// Main test function
async function main() {
  console.log('🚀 Meet Transcription Authentication Test\n');
  
  const firebaseOk = await testFirebaseAuth();
  const oauthOk = testGoogleOAuth();
  
  console.log('\n📊 Test Results:');
  console.log(`   Firebase/Firestore: ${firebaseOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Google OAuth: ${oauthOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (firebaseOk && oauthOk) {
    console.log('\n🎉 All tests passed! You can start the application.');
    console.log('   Run: npm run dev');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Check the messages above for solutions.');
    process.exit(1);
  }
}

main().catch(console.error); 