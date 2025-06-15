// Main App Controller
let currentUser = null;
let currentBookingsPage = 1;
let currentMembersPage = 1;
const bookingsPerPage = 10;
const membersPerPage = 10;
let allBookingsData = [];
let allMembersData = [];

document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

function initApp() {
  // Initialize Firebase auth state listener
  auth.onAuthStateChanged(user => {
    if (user) {
      // User is signed in
      currentUser = user;
      checkAdminStatus(user);
      initUI();
      initScheduledTasks();
    } else {
      // No user signed in
      window.location.href = 'login.html';
    }
  });

  // Initialize mobile menu toggle
  document.querySelector('.mobile-menu-btn')?.addEventListener('click', toggleSidebar);

  // Initialize logout buttons
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('logoutDropdownBtn')?.addEventListener('click', logout);
  
  // Initialize form submissions
  document.getElementById('classForm')?.addEventListener('submit', handleClassFormSubmit);
  document.getElementById('instructorForm')?.addEventListener('submit', handleInstructorFormSubmit);
  document.getElementById('notificationForm')?.addEventListener('submit', handleNotificationSubmit);
  
  // Initialize report buttons
  document.getElementById('generateBookingReport')?.addEventListener('click', generateBookingReport);
  document.getElementById('generateRevenueReport')?.addEventListener('click', generateRevenueReport);
  document.getElementById('generateMemberReport')?.addEventListener('click', generateMemberReport);

  // Initialize notification recipient type toggle
  document.querySelectorAll('input[name="recipientType"]').forEach(radio => {
    radio.addEventListener('change', function() {
      document.getElementById('notificationClass').disabled = this.value !== 'class';
    });
  });

  // Initialize search functionality
  document.getElementById('bookingSearchBtn')?.addEventListener('click', () => {
    const searchTerm = document.getElementById('bookingSearch').value;
    currentBookingsPage = 1;
    loadBookingsData(searchTerm);
  });

  document.getElementById('bookingSearch')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const searchTerm = document.getElementById('bookingSearch').value;
      currentBookingsPage = 1;
      loadBookingsData(searchTerm);
    }
  });

  document.getElementById('memberSearchBtn')?.addEventListener('click', () => {
    const searchTerm = document.getElementById('memberSearch').value;
    currentMembersPage = 1;
    loadUsersData(searchTerm);
  });

  document.getElementById('memberSearch')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const searchTerm = document.getElementById('memberSearch').value;
      currentMembersPage = 1;
      loadUsersData(searchTerm);
    }
  });

  // Initialize date filter for classes
  document.getElementById('classDateFilter')?.addEventListener('change', loadClassesData);

  // Initialize settings forms
  document.getElementById('systemSettingsForm')?.addEventListener('submit', saveSystemSettings);
  document.getElementById('adminProfileForm')?.addEventListener('submit', saveAdminProfile);
  document.getElementById('changePasswordForm')?.addEventListener('submit', changeAdminPassword);

  // Initialize danger zone buttons
  document.getElementById('backupDatabaseBtn')?.addEventListener('click', backupDatabase);
  document.getElementById('clearTestDataBtn')?.addEventListener('click', confirmClearTestData);
  document.getElementById('resetSystemBtn')?.addEventListener('click', confirmResetSystem);
}

function initScheduledTasks() {
  // Check every hour for pending tasks
  setInterval(checkPendingTasks, 60 * 60 * 1000);
  // Run immediately on load
  checkPendingTasks();
}

async function checkPendingTasks() {
  await sendPaymentReminders();
  await sendClassReminders();
}

function checkAdminStatus(user) {
  db.collection("users").doc(user.uid).get()
    .then(doc => {
      if (doc.exists && doc.data().isAdmin) {
        // User is admin, load dashboard
        loadAdminData(user);
        loadDashboardData();
      } else {
        // User is not admin
        alert("You don't have admin privileges");
        logout();
      }
    })
    .catch(error => {
      console.error("Error checking admin status:", error);
      logout();
    });
}

function loadAdminData(user) {
  db.collection("users").doc(user.uid).get()
    .then(doc => {
      if (doc.exists) {
        const userData = doc.data();
        document.getElementById('adminNameDisplay').textContent = userData.fullName || 'Admin';
        document.getElementById('userName').textContent = userData.fullName || 'Admin';
      }
    });
}

// Dashboard Functions
function loadDashboardData() {
  // Load today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Load today's bookings
  db.collection("bookings")
    .where("date", ">=", today)
    .get()
    .then(snapshot => {
      const count = snapshot.size;
      document.getElementById('todayBookings').textContent = count;
      
      // Calculate revenue
      let revenue = 0;
      snapshot.forEach(doc => {
        if (doc.data().paymentStatus === 'paid') {
          revenue += parseFloat(doc.data().price) || 0;
        }
      });
      document.getElementById('revenueToday').textContent = `RM ${revenue.toFixed(2)}`;
      
      // Load recent bookings (last 5)
      loadRecentBookings();
    });

  // 2. Load active members
  db.collection("users")
    .where("status", "==", "active")
    .get()
    .then(snapshot => {
      document.getElementById('activeMembers').textContent = snapshot.size;
    });

  // 3. Load today's classes
  db.collection("classes")
    .where("date", ">=", today)
    .get()
    .then(snapshot => {
      document.getElementById('classesToday').textContent = snapshot.size;
    });

  // Initialize charts
  initCharts();
}

function loadRecentBookings() {
  const recentBookingsTable = document.getElementById('recentBookings');
  
  db.collection("bookings")
    .orderBy("timestamp", "desc")
    .limit(5)
    .get()
    .then(snapshot => {
      recentBookingsTable.innerHTML = '';
      
      if (snapshot.empty) {
        recentBookingsTable.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-4 text-muted">No recent bookings</td>
          </tr>
        `;
      } else {
        snapshot.forEach(async doc => {
          const booking = doc.data();
          const date = booking.date.toDate();
          const userDoc = await db.collection("users").doc(booking.userId).get();
          const userName = userDoc.exists ? userDoc.data().fullName : 'Unknown';
          
          recentBookingsTable.innerHTML += `
            <tr>
              <td>${userName}</td>
              <td>${booking.class || 'N/A'}</td>
              <td>${date.toLocaleDateString()}</td>
              <td>${booking.time || 'N/A'}</td>
              <td>RM ${parseFloat(booking.price || 0).toFixed(2)}</td>
              <td><span class="badge ${getPaymentStatusClass(booking.paymentStatus)}">${booking.paymentStatus || 'pending'}</span></td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="viewBooking('${doc.id}')">
                  <i class="fas fa-eye"></i> View
                </button>
              </td>
            </tr>
          `;
        });
      }
    });
}

// Bookings Management - Enhanced Version
function loadBookingsData(searchTerm = '') {
  const allBookings = document.getElementById('allBookings');
  allBookings.innerHTML = '<tr><td colspan="8" class="text-center py-4">Loading bookings...</td></tr>';

  db.collection("bookings")
    .orderBy("timestamp", "desc")
    .get()
    .then(async snapshot => {
      allBookings.innerHTML = '';
      
      if (snapshot.empty) {
        allBookings.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No bookings found</td></tr>';
        allBookingsData = [];
        updateBookingsPagination();
        return;
      }

      // Process all bookings data
      allBookingsData = [];
      const bookingsPromises = [];
      
      snapshot.forEach(doc => {
        const booking = doc.data();
        bookingsPromises.push(
          db.collection("users").doc(booking.userId).get()
            .then(userDoc => {
              return {
                id: doc.id,
                booking: booking,
                userName: userDoc.exists ? userDoc.data().fullName : 'Unknown'
              };
            })
        );
      });

      // Wait for all user data to be fetched
      const bookingsWithUsers = await Promise.all(bookingsPromises);
      
      // Filter by search term if provided
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        allBookingsData = bookingsWithUsers.filter(item => 
          item.id.includes(term) || 
          item.userName.toLowerCase().includes(term) ||
          (item.booking.class && item.booking.class.toLowerCase().includes(term)) ||
          (item.booking.paymentStatus && item.booking.paymentStatus.toLowerCase().includes(term))
        )
      } else {
        allBookingsData = bookingsWithUsers;
      }

      updateBookingsTable();
      updateBookingsPagination();
    })
    .catch(error => {
      console.error("Error loading bookings:", error);
      allBookings.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error loading bookings</td></tr>';
    });
}

function updateBookingsTable() {
  const allBookings = document.getElementById('allBookings');
  allBookings.innerHTML = '';

  if (allBookingsData.length === 0) {
    allBookings.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No bookings found</td></tr>';
    return;
  }

  // Calculate pagination range
  const startIndex = (currentBookingsPage - 1) * bookingsPerPage;
  const endIndex = Math.min(startIndex + bookingsPerPage, allBookingsData.length);
  const bookingsToShow = allBookingsData.slice(startIndex, endIndex);

  // Populate table
  bookingsToShow.forEach(item => {
    const booking = item.booking;
    const date = booking.date.toDate();
    
    allBookings.innerHTML += `
      <tr>
        <td>${item.id.substring(0, 8)}</td>
        <td>${item.userName}</td>
        <td>${booking.class || 'N/A'}</td>
        <td>${date.toLocaleDateString()}</td>
        <td>${booking.time || 'N/A'}</td>
        <td>RM ${parseFloat(booking.price || 0).toFixed(2)}</td>
        <td><span class="badge ${getPaymentStatusClass(booking.paymentStatus)}">${booking.paymentStatus || 'pending'}</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="viewBooking('${item.id}')">
            <i class="fas fa-eye"></i> View
          </button>
        </td>
      </tr>
    `;
  });

  // Update pagination info
  document.getElementById('showingFrom').textContent = startIndex + 1;
  document.getElementById('showingTo').textContent = endIndex;
  document.getElementById('totalBookings').textContent = allBookingsData.length;
}

function updateBookingsPagination() {
  const totalPages = Math.ceil(allBookingsData.length / bookingsPerPage);
  const pagination = document.querySelector('#bookingsSection .pagination');
  
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }
  
  pagination.style.display = 'flex';
  let paginationHTML = `
    <li class="page-item ${currentBookingsPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" id="prevPage">Previous</a>
    </li>
  `;

  // Show page numbers
  for (let i = 1; i <= totalPages; i++) {
    paginationHTML += `
      <li class="page-item ${i === currentBookingsPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }

  paginationHTML += `
    <li class="page-item ${currentBookingsPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" id="nextPage">Next</a>
    </li>
  `;

  pagination.innerHTML = paginationHTML;

  // Add event listeners
  document.getElementById('prevPage')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentBookingsPage > 1) {
      currentBookingsPage--;
      updateBookingsTable();
    }
  });

  document.getElementById('nextPage')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentBookingsPage < totalPages) {
      currentBookingsPage++;
      updateBookingsTable();
    }
  });

  document.querySelectorAll('#bookingsSection .page-link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentBookingsPage = parseInt(e.target.getAttribute('data-page'));
      updateBookingsTable();
    });
  });
}

// Classes Management
async function loadClassesData() {
  const classesList = document.getElementById('classesList');
  const classDateFilter = document.getElementById('classDateFilter');
  
  classesList.innerHTML = '<tr><td colspan="6" class="text-center py-4">Loading classes...</td></tr>';

  try {
    // Set up query
    let query = db.collection("classes");
    
    // Apply date filter if set
    if (classDateFilter.value) {
      const selectedDate = new Date(classDateFilter.value);
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      query = query.where("date", ">=", selectedDate)
                  .where("date", "<", nextDay);
    } else {
      // Default to today and future classes
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.where("date", ">=", today);
    }
    
    query = query.orderBy("date");

    const snapshot = await query.get();
    classesList.innerHTML = '';

    if (snapshot.empty) {
      classesList.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No classes found</td></tr>';
    } else {
      for (const doc of snapshot.docs) {
        const classData = doc.data();
        const classDate = classData.date.toDate();
        
        // Get instructor name
        let instructorName = 'N/A';
        if (classData.instructorId) {
          const instructorDoc = await db.collection("instructors").doc(classData.instructorId).get();
          if (instructorDoc.exists) {
            instructorName = instructorDoc.data().name;
          }
        }
        
        classesList.innerHTML += `
          <tr>
            <td>${classData.name || 'N/A'}</td>
            <td>${instructorName}</td>
            <td>${classDate.toLocaleDateString()}</td>
            <td>${classData.time || 'N/A'}</td>
            <td>${classData.bookedCount || 0}/${classData.capacity || 0}</td>
            <td>
              <button class="btn btn-sm btn-primary me-2" onclick="editClass('${doc.id}')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-danger me-2" onclick="confirmDeleteClass('${doc.id}')">
                <i class="fas fa-trash"></i>
              </button>
              <button class="btn btn-sm btn-info" onclick="notifyClassCancellation('${doc.id}')">
                <i class="fas fa-bell"></i> Cancel
              </button>
            </td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error("Error loading classes:", error);
    classesList.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Error loading classes</td></tr>';
  }
}

async function handleClassFormSubmit(e) {
  e.preventDefault();
  
  const classId = document.getElementById('classId').value;
  const className = document.getElementById('className').value;
  const instructorId = document.getElementById('instructor').value;
  const classDate = document.getElementById('classDate').value;
  const classTime = document.getElementById('classTime').value;
  const classDuration = document.getElementById('classDuration').value;
  const classCapacity = document.getElementById('classCapacity').value;
  const classPrice = document.getElementById('classPrice').value;
  const classCategory = document.getElementById('classCategory').value;
  const classDescription = document.getElementById('classDescription').value;

  if (!className || !instructorId || !classDate || !classTime || !classCapacity || !classPrice) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  try {
    // Get instructor details
    const instructorDoc = await db.collection('instructors').doc(instructorId).get();
    if (!instructorDoc.exists) {
      throw new Error('Selected instructor not found');
    }
    const instructor = instructorDoc.data();

    const classData = {
      name: className,
      instructorId: instructorId,
      instructor: instructor.name,
      date: new Date(classDate),
      time: classTime,
      duration: parseInt(classDuration),
      capacity: parseInt(classCapacity),
      price: parseFloat(classPrice),
      category: classCategory,
      description: classDescription,
      bookedCount: 0,
      status: 'active',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (classId) {
      // Update existing class
      await db.collection('classes').doc(classId).update(classData);
      showToast('Class updated successfully', 'success');
    } else {
      // Add new class
      classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('classes').add(classData);
      showToast('Class added successfully', 'success');
    }

    resetClassForm();
    loadClassesData();
  } catch (error) {
    console.error('Error saving class:', error);
    showToast('Error saving class: ' + error.message, 'error');
  }
}

window.editClass = async function(classId) {
  try {
    const doc = await db.collection('classes').doc(classId).get();
    if (doc.exists) {
      const classData = doc.data();
      
      document.getElementById('classId').value = doc.id;
      document.getElementById('className').value = classData.name;
      document.getElementById('instructor').value = classData.instructorId;
      document.getElementById('classDate').value = classData.date.toISOString().split('T')[0];
      document.getElementById('classTime').value = classData.time;
      document.getElementById('classDuration').value = classData.duration;
      document.getElementById('classCapacity').value = classData.capacity;
      document.getElementById('classPrice').value = classData.price;
      document.getElementById('classCategory').value = classData.category;
      document.getElementById('classDescription').value = classData.description;
      
      document.getElementById('classSubmitBtn').textContent = 'Update Class';
      document.getElementById('classCancelBtn').style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading class:', error);
    showToast('Error loading class: ' + error.message, 'error');
  }
};

window.confirmDeleteClass = function(classId) {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm Class Deletion';
  document.getElementById('confirmModalBody').textContent = 'Are you sure you want to delete this class? All related bookings will be cancelled.';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Delete';
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.onclick = async () => {
    try {
      // First check if there are any bookings
      const bookings = await db.collection('bookings')
        .where('classId', '==', classId)
        .get();
      
      if (!bookings.empty) {
        // Cancel all bookings
        const batch = db.batch();
        bookings.forEach(booking => {
          batch.update(booking.ref, {
            status: 'cancelled',
            cancellationReason: 'Class deleted by admin'
          });
        });
        await batch.commit();
      }
      
      // Delete the class
      await db.collection('classes').doc(classId).delete();
      
      showToast('Class deleted successfully', 'success');
      loadClassesData();
      modal.hide();
    } catch (error) {
      console.error('Error deleting class:', error);
      showToast('Error deleting class: ' + error.message, 'error');
      modal.hide();
    }
  };
  
  modal.show();
};

function resetClassForm() {
  document.getElementById('classForm').reset();
  document.getElementById('classId').value = '';
  document.getElementById('classSubmitBtn').textContent = 'Add Class';
  document.getElementById('classCancelBtn').style.display = 'none';
}

// Members Management
async function loadUsersData(searchTerm = '') {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '<tr><td colspan="7" class="text-center py-4">Loading members...</td></tr>';

  try {
    let query = db.collection("users").orderBy("fullName");
    
    if (searchTerm) {
      const snapshot = await query.get();
      allMembersData = snapshot.docs.filter(doc => 
        doc.id.includes(searchTerm) || 
        doc.data().fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.data().email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      const snapshot = await query.get();
      allMembersData = snapshot.docs;
    }

    updateMembersTable();
    updateMembersPagination();
  } catch (error) {
    console.error("Error loading members:", error);
    usersList.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-danger">Error loading members</td></tr>';
  }
}

function updateMembersTable() {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';

  if (allMembersData.length === 0) {
    usersList.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No members found</td></tr>';
    return;
  }

  const startIndex = (currentMembersPage - 1) * membersPerPage;
  const endIndex = Math.min(startIndex + membersPerPage, allMembersData.length);
  
  const membersToShow = allMembersData.slice(startIndex, endIndex);

  membersToShow.forEach(doc => {
    const user = doc.data();
    const joinDate = user.joinDate?.toDate() || new Date();
    
    usersList.innerHTML += `
      <tr>
        <td>${doc.id.substring(0, 8)}</td>
        <td>${user.fullName || 'N/A'}</td>
        <td>${user.email || 'N/A'}</td>
        <td>${user.phone || 'N/A'}</td>
        <td>${user.age || 'N/A'}</td>
        <td>${joinDate.toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-primary me-2" onclick="viewUser('${doc.id}')">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteUser('${doc.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  document.getElementById('showingMembersFrom').textContent = startIndex + 1;
  document.getElementById('showingMembersTo').textContent = endIndex;
  document.getElementById('totalMembers').textContent = allMembersData.length;
}

function updateMembersPagination() {
  const totalPages = Math.ceil(allMembersData.length / membersPerPage);
  const pagination = document.querySelector('#membersSection .pagination');
  
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }
  
  pagination.style.display = 'flex';
  let paginationHTML = `
    <li class="page-item ${currentMembersPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" id="prevMemberPage">Previous</a>
    </li>
  `;

  for (let i = 1; i <= totalPages; i++) {
    paginationHTML += `
      <li class="page-item ${i === currentMembersPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }

  paginationHTML += `
    <li class="page-item ${currentMembersPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" id="nextMemberPage">Next</a>
    </li>
  `;

  pagination.innerHTML = paginationHTML;

  // Add event listeners
  document.getElementById('prevMemberPage')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentMembersPage > 1) {
      currentMembersPage--;
      updateMembersTable();
    }
  });

  document.getElementById('nextMemberPage')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentMembersPage < totalPages) {
      currentMembersPage++;
      updateMembersTable();
    }
  });

  document.querySelectorAll('#membersSection .page-link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentMembersPage = parseInt(e.target.getAttribute('data-page'));
      updateMembersTable();
    });
  });
}

window.viewUser = function(userId) {
  db.collection("users").doc(userId).get()
    .then(async (doc) => {
      if (doc.exists) {
        const user = doc.data();
        const joinDate = user.joinDate?.toDate() || new Date();
        
        // Get user's bookings
        const bookings = await db.collection("bookings")
          .where("userId", "==", userId)
          .orderBy("date", "desc")
          .limit(5)
          .get();
        
        let bookingsHTML = '';
        if (bookings.empty) {
          bookingsHTML = '<p class="text-muted">No recent bookings</p>';
        } else {
          bookingsHTML = '<ul class="list-group">';
          bookings.forEach(bookingDoc => {
            const booking = bookingDoc.data();
            const date = booking.date.toDate();
            bookingsHTML += `
              <li class="list-group-item">
                ${booking.class || 'N/A'} on ${date.toLocaleDateString()} at ${booking.time || 'N/A'}
                <span class="badge ${getPaymentStatusClass(booking.paymentStatus)} float-end">
                  ${booking.paymentStatus || 'pending'}
                </span>
              </li>
            `;
          });
          bookingsHTML += '</ul>';
        }
        
        // Build modal content
        const modalContent = `
          <div class="row">
            <div class="col-md-4">
              <div class="text-center mb-3">
                <img src="${user.photoURL || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png'}" 
                     class="img-fluid rounded-circle mb-2" width="150" height="150">
                <h4>${user.fullName || 'N/A'}</h4>
                <span class="badge ${user.status === 'active' ? 'bg-success' : 'bg-secondary'}">
                  ${user.status || 'inactive'}
                </span>
              </div>
            </div>
            <div class="col-md-8">
              <div class="mb-3">
                <h5>Personal Information</h5>
                <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
                <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
                <p><strong>Age:</strong> ${user.age || 'N/A'}</p>
                <p><strong>Gender:</strong> ${user.gender || 'N/A'}</p>
                <p><strong>Joined:</strong> ${joinDate.toLocaleDateString()}</p>
              </div>
              <div class="mb-3">
                <h5>Recent Bookings</h5>
                ${bookingsHTML}
              </div>
            </div>
          </div>
        `;
        
        // Set modal content
        document.getElementById('viewModalTitle').textContent = 'Member Details';
        document.getElementById('viewModalBody').innerHTML = modalContent;
        
        // Show modal
        new bootstrap.Modal(document.getElementById('viewModal')).show();
      }
    });
};

window.confirmDeleteUser = function(userId) {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm Member Deletion';
  document.getElementById('confirmModalBody').textContent = 'Are you sure you want to delete this member account? This action cannot be undone.';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Delete';
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.onclick = async () => {
    try {
      // First delete user's bookings
      const bookings = await db.collection('bookings')
        .where('userId', '==', userId)
        .get();
      
      if (!bookings.empty) {
        const batch = db.batch();
        bookings.forEach(booking => {
          batch.delete(booking.ref);
        });
        await batch.commit();
      }
      
      // Delete the user document
      await db.collection('users').doc(userId).delete();
      
      showToast('Member deleted successfully', 'success');
      loadUsersData();
      modal.hide();
    } catch (error) {
      console.error('Error deleting member:', error);
      showToast('Error deleting member: ' + error.message, 'error');
      modal.hide();
    }
  };
  
  modal.show();
};

// Notifications Management
async function loadNotifications() {
  const notificationsList = document.getElementById('notificationsList');
  notificationsList.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading notifications...</td></tr>';

  try {
    const snapshot = await db.collection("notifications")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();
    
    notificationsList.innerHTML = '';

    if (snapshot.empty) {
      notificationsList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No notifications found</td></tr>';
    } else {
      for (const doc of snapshot.docs) {
        const notification = doc.data();
        const date = notification.timestamp.toDate();
        
        notificationsList.innerHTML += `
          <tr>
            <td>${notification.title || 'N/A'}</td>
            <td>${notification.message || 'N/A'}</td>
            <td>${date.toLocaleString()}</td>
            <td>${notification.type || 'general'}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="deleteNotification('${doc.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error("Error loading notifications:", error);
    notificationsList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error loading notifications</td></tr>';
  }
}

async function populateClassDropdown() {
  const dropdown = document.getElementById('notificationClass');
  dropdown.innerHTML = '<option value="">Select Class</option>';
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const snapshot = await db.collection("classes")
      .where("date", ">=", today)
      .orderBy("date")
      .get();
    
    snapshot.forEach(doc => {
      const classData = doc.data();
      const classDate = classData.date.toDate();
      dropdown.innerHTML += `<option value="${doc.id}">${classData.name} - ${classDate.toLocaleDateString()}</option>`;
    });
  } catch (error) {
    console.error("Error loading classes for dropdown:", error);
  }
}

async function handleNotificationSubmit(e) {
  e.preventDefault();
  
  const title = document.getElementById('notificationTitle').value;
  const message = document.getElementById('notificationMessage').value;
  const recipientType = document.querySelector('input[name="recipientType"]:checked').value;
  const classId = document.getElementById('notificationClass').value;
  
  if (!title || !message) {
    showToast('Please fill all required fields', 'error');
    return;
  }
  
  if (recipientType === 'class' && !classId) {
    showToast('Please select a class when sending to specific attendees', 'error');
    return;
  }
  
  try {
    let count = 0;
    
    if (recipientType === 'all') {
      count = await sendNotificationToAllMembers(title, message);
    } else if (recipientType === 'active') {
      count = await sendNotificationToActiveMembers(title, message);
    } else if (recipientType === 'class') {
      count = await sendNotificationToClassAttendees(classId, title, message);
    }
    
    showToast(`Notification sent to ${count} users`, 'success');
    e.target.reset();
    loadNotifications();
  } catch (error) {
    console.error("Error sending notifications:", error);
    showToast('Error sending notifications: ' + error.message, 'error');
  }
}

async function sendNotificationToClassAttendees(classId, title, message) {
  const bookings = await db.collection("bookings")
    .where("classId", "==", classId)
    .where("paymentStatus", "==", "paid")
    .get();
  
  if (bookings.empty) {
    showToast('No paid attendees found for this class', 'warning');
    return 0;
  }
  
  const batch = db.batch();
  const notificationsRef = db.collection("notifications");
  
  bookings.forEach(booking => {
    const notificationRef = notificationsRef.doc();
    batch.set(notificationRef, {
      userId: booking.data().userId,
      title: title,
      message: message,
      type: 'class',
      isRead: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      relatedClass: classId
    });
  });
  
  await batch.commit();
  return bookings.size;
}

window.deleteNotification = function(notificationId) {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm Deletion';
  document.getElementById('confirmModalBody').textContent = 'Are you sure you want to delete this notification?';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Delete';
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.onclick = async () => {
    try {
      await db.collection("notifications").doc(notificationId).delete();
      showToast('Notification deleted successfully', 'success');
      loadNotifications();
      modal.hide();
    } catch (error) {
      console.error("Error deleting notification:", error);
      showToast('Error deleting notification', 'error');
      modal.hide();
    }
  };
  
  modal.show();
};

// Reports Management
async function generateBookingReport() {
  const startDate = document.getElementById('bookingReportStart').value;
  const endDate = document.getElementById('bookingReportEnd').value;
  
  if (!startDate || !endDate) {
    showToast('Please select date range', 'error');
    return;
  }
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const snapshot = await db.collection("bookings")
      .where("date", ">=", start)
      .where("date", "<=", end)
      .orderBy("date")
      .get();
    
    if (snapshot.empty) {
      showToast('No bookings found in selected date range', 'warning');
      return;
    }
    
    // Prepare report data
    const reportData = [];
    let totalRevenue = 0;
    let totalBookings = 0;
    
    for (const doc of snapshot.docs) {
      const booking = doc.data();
      const date = booking.date.toDate();
      const userDoc = await db.collection("users").doc(booking.userId).get();
      const userName = userDoc.exists ? userDoc.data().fullName : 'Unknown';
      
      if (booking.paymentStatus === 'paid') {
        totalRevenue += parseFloat(booking.price) || 0;
      }
      totalBookings++;
      
      reportData.push({
        'Booking ID': doc.id.substring(0, 8),
        'Member': userName,
        'Class': booking.class || 'N/A',
        'Date': date.toLocaleDateString(),
        'Time': booking.time || 'N/A',
        'Amount': `RM ${parseFloat(booking.price || 0).toFixed(2)}`,
        'Status': booking.paymentStatus || 'pending'
      });
    }
    
    // Generate Excel file
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(reportData);
    XLSX.utils.book_append_sheet(wb, ws, "Bookings Report");
    
    // Add summary sheet
    const summaryData = [
      ['Report Period', `${startDate} to ${endDate}`],
      ['Total Bookings', totalBookings],
      ['Total Revenue', `RM ${totalRevenue.toFixed(2)}`],
      ['Generated On', new Date().toLocaleString()]
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
    
    // Save the file
    const reportName = `Bookings_Report_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(wb, reportName);
    
    // Save report record
    await db.collection("reports").add({
      type: 'bookings',
      period: `${startDate} to ${endDate}`,
      generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      generatedBy: currentUser.uid,
      totalBookings: totalBookings,
      totalRevenue: totalRevenue,
      fileName: reportName
    });
    
    showToast('Booking report generated successfully', 'success');
    loadReportsList();
  } catch (error) {
    console.error("Error generating booking report:", error);
    showToast('Error generating report: ' + error.message, 'error');
  }
}

async function generateRevenueReport() {
  const reportType = document.getElementById('revenueReportType').value;
  
  try {
    let query = db.collection("bookings")
      .where("paymentStatus", "==", "paid");
    
    let title = '';
    let groupBy = '';
    const now = new Date();
    
    // Set date range based on report type
    switch(reportType) {
      case 'daily':
        title = 'Daily Revenue Report';
        groupBy = 'day';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.where("date", ">=", today);
        break;
      case 'weekly':
        title = 'Weekly Revenue Report';
        groupBy = 'week';
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);
        query = query.where("date", ">=", weekStart);
        break;
      case 'monthly':
        title = 'Monthly Revenue Report';
        groupBy = 'month';
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - 1);
        monthStart.setHours(0, 0, 0, 0);
        query = query.where("date", ">=", monthStart);
        break;
      case 'class':
        title = 'Class Revenue Report';
        groupBy = 'class';
        break;
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      showToast('No revenue data found for selected period', 'warning');
      return;
    }
    
    // Prepare report data
    const reportData = {};
    let totalRevenue = 0;
    
    for (const doc of snapshot.docs) {
      const booking = doc.data();
      const amount = parseFloat(booking.price) || 0;
      totalRevenue += amount;
      
      let key;
      if (groupBy === 'day') {
        key = booking.date.toDate().toLocaleDateString();
      } else if (groupBy === 'week') {
        const date = booking.date.toDate();
        key = `Week ${getWeekNumber(date)} (${date.getFullYear()})`;
      } else if (groupBy === 'month') {
        const date = booking.date.toDate();
        key = date.toLocaleString('default', { month: 'long' }) + ' ' + date.getFullYear();
      } else if (groupBy === 'class') {
        key = booking.class || 'Other';
      }
      
      if (!reportData[key]) {
        reportData[key] = 0;
      }
      reportData[key] += amount;
    }
    
    // Convert to array for Excel
    const excelData = Object.entries(reportData).map(([key, value]) => ({
      [groupBy === 'class' ? 'Class' : 'Period']: key,
      'Revenue': `RM ${value.toFixed(2)}`,
      'Percentage': `${((value / totalRevenue) * 100).toFixed(1)}%`
    }));
    
    // Add total row
    excelData.push({
      [groupBy === 'class' ? 'Class' : 'Period']: 'TOTAL',
      'Revenue': `RM ${totalRevenue.toFixed(2)}`,
      'Percentage': '100%'
    });
    
    // Generate Excel file
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "Revenue Report");
    
    // Add summary sheet
    const summaryData = [
      ['Report Type', title],
      ['Total Revenue', `RM ${totalRevenue.toFixed(2)}`],
      ['Generated On', new Date().toLocaleString()]
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
    
    // Save the file
    const reportName = `${title.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, reportName);
    
    // Save report record
    await db.collection("reports").add({
      type: 'revenue',
      period: reportType,
      generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      generatedBy: currentUser.uid,
      totalRevenue: totalRevenue,
      fileName: reportName
    });
    
    showToast('Revenue report generated successfully', 'success');
    loadReportsList();
  } catch (error) {
    console.error("Error generating revenue report:", error);
    showToast('Error generating report: ' + error.message, 'error');
  }
}

async function generateMemberReport() {
  const reportType = document.getElementById('memberReportType').value;
  
  try {
    let query = db.collection("users");
    let title = '';
    
    switch(reportType) {
      case 'active':
        title = 'Active Members Report';
        query = query.where("status", "==", "active");
        break;
      case 'new':
        title = 'New Members Report';
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - 1);
        monthStart.setHours(0, 0, 0, 0);
        query = query.where("joinDate", ">=", monthStart);
        break;
      case 'status':
        title = 'Membership Status Report';
        break;
      case 'attendance':
        title = 'Member Attendance Report';
        break;
    }
    
    const snapshot = await query.orderBy("fullName").get();
    
    if (snapshot.empty) {
      showToast('No members found for selected report type', 'warning');
      return;
    }
    
    // Prepare report data
    const reportData = [];
    let statusCounts = {};
    
    for (const doc of snapshot.docs) {
      const user = doc.data();
      const joinDate = user.joinDate?.toDate() || new Date();
      
      // For attendance report, get booking count
      let bookingCount = 0;
      if (reportType === 'attendance') {
        const bookings = await db.collection("bookings")
          .where("userId", "==", doc.id)
          .where("paymentStatus", "==", "paid")
          .get();
        bookingCount = bookings.size;
      }
      
      reportData.push({
        'Member ID': doc.id.substring(0, 8),
        'Name': user.fullName || 'N/A',
        'Email': user.email || 'N/A',
        'Phone': user.phone || 'N/A',
        'Status': user.status || 'inactive',
        'Joined Date': joinDate.toLocaleDateString(),
        ...(reportType === 'attendance' && { 'Classes Attended': bookingCount })
      });
      
      // Count statuses for status report
      if (reportType === 'status') {
        const status = user.status || 'inactive';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
    }
    
    // Generate Excel file
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(reportData);
    XLSX.utils.book_append_sheet(wb, ws, "Members Report");
    
    // Add summary sheet
    const summaryData = [
      ['Report Type', title],
      ['Total Members', snapshot.size],
      ['Generated On', new Date().toLocaleString()]
    ];
    
    if (reportType === 'status') {
      summaryData.push(['Status Breakdown', '']);
      for (const [status, count] of Object.entries(statusCounts)) {
        summaryData.push([status, count]);
      }
    }
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
    
    // Save the file
    const reportName = `${title.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, reportName);
    
    // Save report record
    await db.collection("reports").add({
      type: 'members',
      period: reportType,
      generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      generatedBy: currentUser.uid,
      totalMembers: snapshot.size,
      fileName: reportName
    });
    
    showToast('Member report generated successfully', 'success');
    loadReportsList();
  } catch (error) {
    console.error("Error generating member report:", error);
    showToast('Error generating report: ' + error.message, 'error');
  }
}

async function loadReportsList() {
  const reportsList = document.getElementById('reportsList');
  reportsList.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading reports...</td></tr>';

  try {
    const snapshot = await db.collection("reports")
      .orderBy("generatedAt", "desc")
      .limit(20)
      .get();
    
    reportsList.innerHTML = '';

    if (snapshot.empty) {
      reportsList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No reports found</td></tr>';
    } else {
      for (const doc of snapshot.docs) {
        const report = doc.data();
        const date = report.generatedAt.toDate();
        
        reportsList.innerHTML += `
          <tr>
            <td>${report.type || 'N/A'}</td>
            <td>${date.toLocaleString()}</td>
            <td>${report.period || 'N/A'}</td>
            <td>${report.fileName || 'N/A'}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="downloadReport('${doc.id}', '${report.fileName}')">
                <i class="fas fa-download"></i> Download
              </button>
            </td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error("Error loading reports:", error);
    reportsList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error loading reports</td></tr>';
  }
}

window.downloadReport = function(reportId, fileName) {
  // In a real app, you would fetch the report from storage
  // For now, we'll just notify that the file was "downloaded"
  showToast(`Report ${fileName} downloaded`, 'success');
};

// Settings Management
async function loadSettings() {
  try {
    // Load system settings
    const doc = await db.collection("settings").doc("system").get();
    if (doc.exists) {
      const settings = doc.data();
      
      // Business info
      document.getElementById('businessName').value = settings.businessName || '';
      document.getElementById('businessAddress').value = settings.businessAddress || '';
      document.getElementById('businessPhone').value = settings.businessPhone || '';
      document.getElementById('businessEmail').value = settings.businessEmail || '';
      
      // Booking settings
      document.getElementById('allowOnlineBooking').checked = settings.allowOnlineBooking !== false;
      document.getElementById('requirePayment').checked = settings.requirePayment !== false;
      document.getElementById('cancellationPolicy').value = settings.cancellationPolicy || 24;
      
      // Notification settings
      document.getElementById('emailNotifications').checked = settings.emailNotifications !== false;
      document.getElementById('smsNotifications').checked = settings.smsNotifications === true;
    }
    
    // Load admin profile
    if (currentUser) {
      const userDoc = await db.collection("users").doc(currentUser.uid).get();
      if (userDoc.exists) {
        const user = userDoc.data();
        document.getElementById('adminName').value = user.fullName || '';
        document.getElementById('adminEmail').value = user.email || '';
        document.getElementById('adminPhone').value = user.phone || '';
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
    showToast('Error loading settings', 'error');
  }
}

async function saveSystemSettings(e) {
  e.preventDefault();
  
  try {
    const settings = {
      businessName: document.getElementById('businessName').value,
      businessAddress: document.getElementById('businessAddress').value,
      businessPhone: document.getElementById('businessPhone').value,
      businessEmail: document.getElementById('businessEmail').value,
      allowOnlineBooking: document.getElementById('allowOnlineBooking').checked,
      requirePayment: document.getElementById('requirePayment').checked,
      cancellationPolicy: parseInt(document.getElementById('cancellationPolicy').value) || 24,
      emailNotifications: document.getElementById('emailNotifications').checked,
      smsNotifications: document.getElementById('smsNotifications').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection("settings").doc("system").set(settings, { merge: true });
    showToast('System settings saved successfully', 'success');
  } catch (error) {
    console.error("Error saving system settings:", error);
    showToast('Error saving system settings', 'error');
  }
}

async function saveAdminProfile(e) {
  e.preventDefault();
  
  try {
    if (!currentUser) {
      throw new Error('No user logged in');
    }
    
    const profile = {
      fullName: document.getElementById('adminName').value,
      phone: document.getElementById('adminPhone').value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection("users").doc(currentUser.uid).set(profile, { merge: true });
    showToast('Profile updated successfully', 'success');
    loadAdminData(currentUser);
  } catch (error) {
    console.error("Error saving profile:", error);
    showToast('Error saving profile', 'error');
  }
}

async function changeAdminPassword(e) {
  e.preventDefault();
  
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Please fill all password fields', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }
  
  try {
    // Reauthenticate user
    const credential = firebase.auth.EmailAuthProvider.credential(
      currentUser.email,
      currentPassword
    );
    
    await currentUser.reauthenticateWithCredential(credential);
    
    // Change password
    await currentUser.updatePassword(newPassword);
    
    showToast('Password changed successfully', 'success');
    e.target.reset();
  } catch (error) {
    console.error("Error changing password:", error);
    showToast('Error changing password: ' + error.message, 'error');
  }
}

function backupDatabase() {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm Database Backup';
  document.getElementById('confirmModalBody').textContent = 'This will create a backup of all system data. Continue?';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Backup';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.onclick = async () => {
    try {
      showToast('Starting database backup...', 'info');
      
      // Get all collections data
      const collections = ['bookings', 'classes', 'users', 'instructors', 'notifications', 'settings'];
      const backupData = {};
      
      for (const col of collections) {
        const snapshot = await db.collection(col).get();
        backupData[col] = snapshot.docs.map(doc => doc.data());
      }
      
      // Create JSON file
      const dataStr = JSON.stringify(backupData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `NARS_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast('Database backup completed', 'success');
      modal.hide();
    } catch (error) {
      console.error("Error during backup:", error);
      showToast('Error during backup', 'error');
      modal.hide();
    }
  };
  
  modal.show();
}

function confirmClearTestData() {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm Clear Test Data';
  document.getElementById('confirmModalBody').textContent = 'This will delete all test data. Production data will not be affected. Continue?';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Clear Data';
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.onclick = async () => {
    try {
      showToast('Clearing test data...', 'info');
      
      // In a real app, you would implement logic to identify and delete test data
      // For now, we'll just show a message
      
      showToast('Test data cleared successfully', 'success');
      modal.hide();
    } catch (error) {
      console.error("Error clearing test data:", error);
      showToast('Error clearing test data', 'error');
      modal.hide();
    }
  };
  
  modal.show();
}

function confirmResetSystem() {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm System Reset';
  document.getElementById('confirmModalBody').textContent = 'WARNING: This will reset ALL system data to factory defaults. This action cannot be undone. Continue?';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Reset System';
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.onclick = async () => {
    try {
      showToast('Resetting system...', 'info');
      
      // In a real app, you would implement the reset logic
      // For now, we'll just show a message
      
      showToast('System reset to factory defaults', 'success');
      modal.hide();
    } catch (error) {
      console.error("Error resetting system:", error);
      showToast('Error resetting system', 'error');
      modal.hide();
    }
  };
  
  modal.show();
}

// Helper Functions
function getPaymentStatusClass(status) {
  switch(status?.toLowerCase()) {
    case 'paid': return 'bg-success';
    case 'pending': 
    case 'pending_payment': 
    case 'processing': 
      return 'bg-warning text-dark';
    case 'rejected': 
    case 'declined':
      return 'bg-danger';
    case 'cancelled':
    case 'expired':
      return 'bg-secondary';
    case 'refunded':
    case 'partially_refunded':
      return 'bg-info';
    default: return 'bg-secondary';
  }
}

function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function initCharts() {
  const bookingsCtx = document.getElementById('bookingsChart').getContext('2d');
  new Chart(bookingsCtx, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Bookings',
        data: [12, 19, 3, 5, 2, 3, 15],
        backgroundColor: 'rgba(67, 97, 238, 0.7)',
        borderColor: 'rgba(67, 97, 238, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      }
    }
  });

  const revenueCtx = document.getElementById('revenueChart').getContext('2d');
  new Chart(revenueCtx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'Revenue (RM)',
        data: [1250, 1900, 3000, 2500, 2000, 2800],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true
    }
  });
}

// UI Functions
function initUI() {
  document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const sectionId = this.getAttribute('data-section');
      showSection(sectionId);
    });
  });
}

function showSection(sectionId) {
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  
  document.getElementById(sectionId + 'Section').classList.add('active');
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-section') === sectionId) {
      link.classList.add('active');
    }
  });
  
  switch(sectionId) {
    case 'dashboard':
      loadDashboardData();
      break;
    case 'bookings':
      loadBookingsData();
      break;
    case 'classes':
      loadClassesData();
      populateInstructorDropdown();
      break;
    case 'members':
      loadUsersData();
      break;
    case 'instructors':
      loadInstructorsData();
      break;
    case 'notifications':
      loadNotifications();
      populateClassDropdown();
      break;
    case 'reports':
      loadReportsList();
      break;
    case 'settings':
      loadSettings();
      break;
  }
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('active');
}

function logout() {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}

// Instructor Management Functions
async function handleInstructorFormSubmit(e) {
  e.preventDefault();
  
  const instructorData = {
    name: document.getElementById('instructorName').value,
    email: document.getElementById('instructorEmail').value,
    phone: document.getElementById('instructorPhone').value,
    specialty: document.getElementById('instructorSpecialty').value,
    bio: document.getElementById('instructorBio').value,
    photo: document.getElementById('instructorPhoto').value || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
    status: 'active',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const instructorId = document.getElementById('instructorId').value;
    
    if (instructorId) {
      await db.collection('instructors').doc(instructorId).update(instructorData);
      showToast('Instructor updated successfully', 'success');
    } else {
      await db.collection('instructors').add(instructorData);
      showToast('Instructor added successfully', 'success');
    }
    
    resetInstructorForm();
    loadInstructorsData();
    populateInstructorDropdown();
  } catch (error) {
    console.error('Error saving instructor:', error);
    showToast('Error saving instructor: ' + error.message, 'error');
  }
}

async function loadInstructorsData() {
  const instructorsList = document.getElementById('instructorsList');
  if (!instructorsList) return;

  instructorsList.innerHTML = '<tr><td colspan="6" class="text-center py-4">Loading instructors...</td></tr>';
  
  try {
    const snapshot = await db.collection("instructors").orderBy("name").get();
    
    instructorsList.innerHTML = '';
    
    if (snapshot.empty) {
      instructorsList.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No instructors found</td></tr>';
    } else {
      snapshot.forEach(async doc => {
        const instructor = doc.data();
        const classesSnapshot = await db.collection('classes')
          .where('instructorId', '==', doc.id)
          .get();
        
        instructorsList.innerHTML += `
          <tr>
            <td><img src="${instructor.photo}" alt="${instructor.name}" 
                 class="instructor-photo rounded-circle" width="40" height="40"></td>
            <td>${instructor.name}</td>
            <td>${instructor.specialty || 'N/A'}</td>
            <td>${classesSnapshot.size}</td>
            <td><span class="badge ${instructor.status === 'active' ? 'bg-success' : 'bg-secondary'}">
              ${instructor.status || 'inactive'}</span></td>
            <td>
              <button class="btn btn-sm btn-primary me-2" onclick="editInstructor('${doc.id}')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="confirmDeleteInstructor('${doc.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });
    }
  } catch (error) {
    console.error('Error loading instructors:', error);
    instructorsList.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Error loading instructors</td></tr>';
  }
}

async function populateInstructorDropdown() {
  const dropdown = document.getElementById('instructor');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">Select Instructor</option>';
  
  try {
    const snapshot = await db.collection('instructors').orderBy('name').get();
    snapshot.forEach(doc => {
      const instructor = doc.data();
      dropdown.innerHTML += `<option value="${doc.id}">${instructor.name}</option>`;
    });
  } catch (error) {
    console.error('Error loading instructors for dropdown:', error);
  }
}

function resetInstructorForm() {
  const form = document.getElementById('instructorForm');
  if (form) {
    form.reset();
    document.getElementById('instructorId').value = '';
    document.getElementById('instructorSubmitBtn').textContent = 'Add Instructor';
    document.getElementById('instructorCancelBtn').style.display = 'none';
  }
}

window.editInstructor = async function(instructorId) {
  try {
    const doc = await db.collection('instructors').doc(instructorId).get();
    if (doc.exists) {
      const instructor = doc.data();
      document.getElementById('instructorId').value = doc.id;
      document.getElementById('instructorName').value = instructor.name;
      document.getElementById('instructorEmail').value = instructor.email;
      document.getElementById('instructorPhone').value = instructor.phone;
      document.getElementById('instructorSpecialty').value = instructor.specialty;
      document.getElementById('instructorBio').value = instructor.bio;
      document.getElementById('instructorPhoto').value = instructor.photo;
      document.getElementById('instructorSubmitBtn').textContent = 'Update Instructor';
      document.getElementById('instructorCancelBtn').style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading instructor:', error);
    showToast('Error loading instructor: ' + error.message, 'error');
  }
};

window.confirmDeleteInstructor = function(instructorId) {
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  document.getElementById('confirmModalTitle').textContent = 'Confirm Deletion';
  document.getElementById('confirmModalBody').textContent = 'Are you sure you want to delete this instructor?';
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Delete';
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.onclick = async () => {
    try {
      const classes = await db.collection('classes')
        .where('instructorId', '==', instructorId)
        .get();
      
      if (!classes.empty) {
        throw new Error('Cannot delete instructor with assigned classes');
      }
      
      await db.collection('instructors').doc(instructorId).delete();
      showToast('Instructor deleted successfully', 'success');
      loadInstructorsData();
      modal.hide();
    } catch (error) {
      console.error('Error deleting instructor:', error);
      showToast('Error: ' + error.message, 'error');
      modal.hide();
    }
  };
  
  modal.show();
};

// Notification System
async function sendNotification(userId, title, message, type = 'info') {
  try {
    await db.collection("notifications").add({
      userId: userId,
      title: title,
      message: message,
      type: type,
      isRead: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error sending notification:", error);
    return false;
  }
}

async function sendNotificationToAllMembers(title, message) {
  const users = await db.collection("users").get();
  
  const batch = db.batch();
  users.forEach(user => {
    const notificationRef = db.collection("notifications").doc();
    batch.set(notificationRef, {
      userId: user.id,
      title: title,
      message: message,
      type: 'admin',
      isRead: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  
  await batch.commit();
  return users.size;
}

async function sendNotificationToActiveMembers(title, message) {
  const users = await db.collection("users")
    .where("status", "==", "active")
    .get();
  
  const batch = db.batch();
  users.forEach(user => {
    const notificationRef = db.collection("notifications").doc();
    batch.set(notificationRef, {
      userId: user.id,
      title: title,
      message: message,
      type: 'admin',
      isRead: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  
  await batch.commit();
  return users.size;
}

// Payment Approval System
// Payment Approval System
async function approvePayment(bookingId) {
  try {
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      throw new Error("Booking not found");
    }
    
    const booking = bookingDoc.data();
    
    // Update booking status
    await bookingRef.update({
      paymentStatus: 'paid',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.uid
    });
    
    // Send notification to user
    await sendNotification(
      booking.userId,
      "Payment Approved!",
      `Your payment for ${booking.class} on ${booking.date.toDate().toLocaleDateString()} has been approved.`,
      'payment'
    );
    
    // Update dashboard stats
    await updateDashboardStats();
    
    // Refresh the view
    viewBooking(bookingId);
    
    return true;
  } catch (error) {
    console.error("Error approving payment:", error);
    alert("Error approving payment: " + error.message);
    return false;
  }
}

function showRejectDialog(bookingId) {
  document.getElementById('confirmModalTitle').textContent = 'Reject Payment';
  document.getElementById('confirmModalBody').innerHTML = `
    <div class="mb-3">
      <label for="rejectionReason" class="form-label">Reason for rejection:</label>
      <textarea class="form-control" id="rejectionReason" rows="3" required></textarea>
    </div>
  `;
  
  const confirmBtn = document.getElementById('confirmModalAction');
  confirmBtn.textContent = 'Reject Payment';
  confirmBtn.onclick = async () => {
    const reason = document.getElementById('rejectionReason').value;
    if (!reason) {
      alert('Please provide a reason for rejection');
      return;
    }
    
    const success = await rejectPayment(bookingId, reason);
    if (success) {
      bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();
      viewBooking(bookingId);
    }
  };
  
  new bootstrap.Modal(document.getElementById('confirmModal')).show();
}

async function rejectPayment(bookingId, reason) {
  try {
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      throw new Error("Booking not found");
    }
    
    const booking = bookingDoc.data();
    
    await bookingRef.update({
      paymentStatus: 'rejected',
      rejectionReason: reason,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await sendNotification(
      booking.userId,
      "Payment Rejected",
      `Your payment for ${booking.class} was rejected. Reason: ${reason}. Please contact support or try again.`,
      'payment'
    );
    
    alert('Payment rejected successfully');
    return true;
  } catch (error) {
    console.error("Error rejecting payment:", error);
    alert("Error rejecting payment: " + error.message);
    return false;
  }
}

// Update the viewBooking function to handle pay_later bookings
// In the viewBooking function
window.viewBooking = function(bookingId) {
  db.collection("bookings").doc(bookingId).get()
    .then(async (doc) => {
      if (doc.exists) {
        const booking = doc.data();
        const date = booking.date.toDate();
        
        // Get user and class details
        const [userDoc, classDoc] = await Promise.all([
          db.collection("users").doc(booking.userId).get(),
          booking.classId ? db.collection("classes").doc(booking.classId).get() : Promise.resolve(null)
        ]);
        
        const userName = userDoc.exists ? userDoc.data().fullName : 'Unknown';
        const className = classDoc?.exists ? classDoc.data().name : booking.class || 'N/A';
        
        // Build modal content
        let modalContent = `
          <div class="row">
            <div class="col-md-6">
              <p><strong>Booking ID:</strong> ${doc.id.substring(0, 8)}</p>
              <p><strong>Member:</strong> ${userName}</p>
              <p><strong>Class:</strong> ${className}</p>
              <p><strong>Instructor:</strong> ${booking.instructor || 'N/A'}</p>
            </div>
            <div class="col-md-6">
              <p><strong>Date:</strong> ${date.toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${booking.time || 'N/A'}</p>
              <p><strong>Price:</strong> RM ${parseFloat(booking.price || 0).toFixed(2)}</p>
              <p><strong>Status:</strong> <span class="badge ${getPaymentStatusClass(booking.paymentStatus)}">${booking.paymentStatus || 'pending'}</span></p>
              ${booking.paymentMethod === 'pay_later' ? `<p><strong>Payment Due:</strong> ${booking.paymentDeadline?.toDate().toLocaleString() || 'N/A'}</p>` : ''}
            </div>
          </div>
        `;
        
        // Add payment proof if available
        if (booking.paymentProof) {
          modalContent += `
            <div class="mt-3">
              <h5>Payment Receipt</h5>
              <div class="receipt-container bg-light p-3 rounded">
                <img src="${booking.paymentProof}" alt="Payment Receipt" class="img-fluid receipt-image">
                <div class="mt-2">
                  <a href="${booking.paymentProof}" target="_blank" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-expand"></i> View Full Size
                  </a>
                </div>
              </div>
            </div>
          `;
        }
        
        // Set modal content
        document.getElementById('viewModalTitle').textContent = 'Booking Details';
        document.getElementById('viewModalBody').innerHTML = modalContent;
        
        // Set up action buttons
        const paymentActions = document.getElementById('paymentActions');
        paymentActions.innerHTML = '';
        
        if (booking.paymentStatus === 'pending_payment' || 
            (booking.paymentStatus === 'pending' && booking.paymentMethod === 'pay_later')) {
          paymentActions.innerHTML = `
            <button class="btn btn-success" onclick="approvePayment('${doc.id}')">
              <i class="fas fa-check"></i> Approve
            </button>
            <button class="btn btn-danger" onclick="showRejectDialog('${doc.id}')">
              <i class="fas fa-times"></i> Reject
            </button>
          `;
          
          if (booking.paymentMethod === 'pay_later') {
            paymentActions.innerHTML += `
              <button class="btn btn-warning" onclick="sendPaymentReminder('${doc.id}')">
                <i class="fas fa-bell"></i> Send Reminder
              </button>
            `;
          }
        }
        
        // Show modal
        new bootstrap.Modal(document.getElementById('viewModal')).show();
      }
    });
};

// Add new function to send payment reminders
window.sendPaymentReminder = async function(bookingId) {
  try {
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      throw new Error("Booking not found");
    }
    
    const booking = bookingDoc.data();
    
    // Send notification to user
    await sendNotification(
      booking.userId,
      "Payment Reminder",
      `Friendly reminder: Your payment for ${booking.class} is due soon. Please complete your payment to secure your spot.`,
      'reminder'
    );
    
    // Update booking with reminder info
    await bookingRef.update({
      reminderSent: true,
      lastReminderAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Payment reminder sent successfully', 'success');
  } catch (error) {
    console.error("Error sending payment reminder:", error);
    showToast('Error sending reminder: ' + error.message, 'error');
  }
};

// Update the sendPaymentReminders function to handle pay_later bookings
async function sendPaymentReminders() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Find bookings with 'pay_later' status that are happening soon
  const bookings = await db.collection("bookings")
    .where("paymentStatus", "==", "pending")
    .where("paymentMethod", "==", "pay_later")
    .where("paymentDeadline", "<=", tomorrow)
    .where("paymentDeadline", ">=", now)
    .get();
  
  bookings.forEach(async bookingDoc => {
    const booking = bookingDoc.data();
    
    // Check if reminder was already sent
    if (!booking.reminderSent) {
      await sendNotification(
        booking.userId,
        "Payment Reminder",
        `Friendly reminder: Your payment for ${booking.class} is due soon. Please complete your payment to secure your spot.`,
        'reminder'
      );
      
      // Mark as reminder sent
      await db.collection("bookings").doc(bookingDoc.id).update({
        reminderSent: true,
        lastReminderAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  });
}

async function sendClassReminders() {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  const classes = await db.collection("classes")
    .where("date", ">=", now)
    .where("date", "<=", oneHourFromNow)
    .get();
  
  classes.forEach(async classDoc => {
    const classData = classDoc.data();
    
    if (!classData.reminderSent) {
      // Get all users booked for this class
      const bookings = await db.collection("bookings")
        .where("classId", "==", classDoc.id)
        .where("paymentStatus", "==", "paid")
        .get();
      
      // Send to each user
      const batch = db.batch();
      bookings.forEach(booking => {
        const notificationRef = db.collection("notifications").doc();
        batch.set(notificationRef, {
          userId: booking.data().userId,
          title: "Class Reminder",
          message: `Your ${classData.name} class starts in about 1 hour at ${classData.time}. See you soon!`,
          type: 'reminder',
          isRead: false,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await batch.commit();
      
      // Mark as reminder sent
      await db.collection("classes").doc(classDoc.id).update({
        reminderSent: true
      });
    }
  });
}

// Helper Functions
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');
  
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  
  toastContainer.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();
  
  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
  container.style.zIndex = '1100';
  document.body.appendChild(container);
  return container;
}

// Update dashboard stats
async function updateDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Update today's bookings count
  const bookings = await db.collection("bookings")
    .where("date", ">=", today)
    .get();
  document.getElementById('todayBookings').textContent = bookings.size;

  // Update today's revenue
  let revenue = 0;
  bookings.forEach(doc => {
    if (doc.data().paymentStatus === 'paid') {
      revenue += parseFloat(doc.data().price) || 0;
    }
  });
  document.getElementById('revenueToday').textContent = `RM ${revenue.toFixed(2)}`;

  // Update active members count
  const members = await db.collection("users")
    .where("status", "==", "active")
    .get();
  document.getElementById('activeMembers').textContent = members.size;

  // Update today's classes count
  const classes = await db.collection("classes")
    .where("date", ">=", today)
    .get();
  document.getElementById('classesToday').textContent = classes.size;
}

window.notifyClassCancellation = function(classId) {
  const reason = prompt("Please enter the reason for cancellation:");
  if (!reason) return;
  
  db.collection("classes").doc(classId).get()
    .then(async classDoc => {
      if (!classDoc.exists) return false;
      
      const classData = classDoc.data();
      
      const success = await sendClassNotification(
        classId,
        "Class Cancelled",
        `We're sorry to inform you that the ${classData.name} class on ${classData.date.toDate().toLocaleDateString()} has been cancelled. Reason: ${reason}`
      );
      
      if (success) {
        alert("Cancellation notifications sent successfully");
        await db.collection("classes").doc(classId).update({
          status: 'cancelled',
          cancellationReason: reason
        });
        loadClassesData();
      }
    });
};