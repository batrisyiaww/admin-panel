const firebaseConfig = {
  apiKey: "AIzaSyC9tkpSD8jPyb7E_5Y9xmDp3fuxZVaZMVE",
  authDomain: "nars-26acd.firebaseapp.com",
  projectId: "nars-26acd",
  storageBucket: "nars-26acd.appspot.com",
  messagingSenderId: "724727839166",
  appId: "1:724727839166:web:dd4c8aef2485866e8361ef"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();
const auth = firebase.auth();


// Initialize collections with proper settings
async function initializeCollections() {
  try {
    // Check and initialize essential collections
    const collections = ['bookings', 'classes', 'members', 'instructors', 'notifications', 'reports', 'settings'];
    
    for (const col of collections) {
      const snapshot = await db.collection(col).limit(1).get();
      if (snapshot.empty) {
        await db.collection(col).doc('default').set({ 
          initialized: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
      }
    }

    

    // Initialize notifications collection with proper indexes
    const notificationsRef = db.collection("notifications");
    const notificationsSnapshot = await notificationsRef.limit(1).get();
    if (notificationsSnapshot.empty) {
      await notificationsRef.doc('default').set({ 
        initialized: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
      });
    }

    // Initialize stats
    const statsRef = db.collection('stats').doc('dashboard');
    const statsSnapshot = await statsRef.get();
    if (!statsSnapshot.exists) {
      await statsRef.set({
        todayBookings: 0,
        activeMembers: 0,
        todayRevenue: 0,
        classesToday: 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Initialize settings
    const settingsRef = db.collection('settings').doc('system');
    const settingsSnapshot = await settingsRef.get();
    if (!settingsSnapshot.exists) {
      await settingsRef.set({
        businessName: "NARS Fitness",
        allowOnlineBooking: true,
        cancellationPolicy: 24,
        emailNotifications: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log("Firebase initialization complete");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
  }
}

// Call initialization
initializeCollections();