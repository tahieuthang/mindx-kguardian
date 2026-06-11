document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // 1. Promotional Bar Dismissal
  const promoBar = document.getElementById('promo-bar');
  const closePromoBtn = document.getElementById('close-promo-btn');
  
  if (closePromoBtn && promoBar) {
    closePromoBtn.addEventListener('click', () => {
      promoBar.style.transform = 'translateY(-100%)';
      setTimeout(() => {
        promoBar.style.display = 'none';
      }, 300);
    });
  }

  // 2. Countdown Timer for Offer
  const startCountdown = () => {
    const timerElement = document.getElementById('timer');
    if (!timerElement) return;

    // Set offer end time (e.g., 2 hours 45 minutes from first load)
    let totalSeconds = 2 * 60 * 60 + 45 * 60 + 12;

    const updateTimer = () => {
      if (totalSeconds <= 0) {
        timerElement.textContent = "HẾT HẠN";
        clearInterval(timerInterval);
        return;
      }

      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const pad = (num) => String(num).padStart(2, '0');
      timerElement.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
      totalSeconds--;
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
  };
  startCountdown();

  // 3. Dark/Light Theme Switcher
  const themeToggle = document.getElementById('theme-toggle');
  
  // Check local storage for theme preference
  const currentTheme = localStorage.getItem('theme');
  if (currentTheme === 'dark') {
    document.body.classList.add('dark-theme');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      
      // Save setting
      const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
      localStorage.setItem('theme', theme);
    });
  }

  // 4. Mobile Menu Navigation
  const mobileToggle = document.getElementById('mobile-toggle');
  const mobileSidebar = document.getElementById('mobile-sidebar');
  const mobileOverlay = document.getElementById('mobile-overlay');
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');

  const openMobileMenu = () => {
    mobileSidebar.classList.add('active');
    mobileOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeMobileMenu = () => {
    mobileSidebar.classList.remove('active');
    mobileOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (mobileToggle) mobileToggle.addEventListener('click', openMobileMenu);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileMenu);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

  // 5. Search Bar Input Clear
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchForm = document.getElementById('search-form');

  if (searchInput && searchClear) {
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim().length > 0) {
        searchClear.classList.add('active');
      } else {
        searchClear.classList.remove('active');
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.classList.remove('active');
      searchInput.focus();
    });
  }

  // 6. Course Filtering (Category Tabs)
  const tabButtons = document.querySelectorAll('#course-tabs .tab-btn');
  const courseCards = document.querySelectorAll('.course-card');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active tab button
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const selectedCategory = btn.getAttribute('data-category');

      // Filter course cards with animation
      courseCards.forEach(card => {
        const cardCategory = card.getAttribute('data-category');
        
        // Temporarily reset hovered classes
        card.classList.remove('hovered');
        
        if (selectedCategory === 'all' || cardCategory === selectedCategory) {
          card.style.display = 'block';
          // Trigger entry animation
          card.style.animation = 'none';
          card.offsetHeight; // Trigger reflow
          card.style.animation = 'cardFadeIn 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) forwards';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // CSS injection for course card entry animation
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.innerText = `
    @keyframes cardFadeIn {
      from { opacity: 0; transform: translateY(15px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(styleSheet);

  // 7. Dynamic Udemy-Style Popovers Position Handler
  // On desktop hover, we check screen space and direct popovers left or right
  courseCards.forEach(card => {
    const popover = card.querySelector('.course-popover');
    if (!popover) return;

    card.addEventListener('mouseenter', () => {
      // Reset classes
      popover.classList.remove('popover-right', 'popover-left');

      // Check card boundary position
      const rect = card.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      
      // Calculate remaining space to the right
      const spaceRight = screenWidth - rect.right;
      const popoverWidth = 340; // Approx popover width with padding

      // Choose side based on remaining screen space
      if (spaceRight >= popoverWidth) {
        popover.classList.add('popover-right');
      } else {
        popover.classList.add('popover-left');
      }

      // Add hovered class to trigger animation delay display
      card.classList.add('hovered');
    });

    card.addEventListener('mouseleave', () => {
      card.classList.remove('hovered');
    });
  });

  // 8. Interactive Roadmap Navigator
  const roleButtons = document.querySelectorAll('.roadmap-roles .role-tab');
  const roadmapFlows = document.querySelectorAll('.roadmap-display .roadmap-flow');

  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Active Button
      roleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const selectedRole = btn.getAttribute('data-role');

      // Switch flows
      roadmapFlows.forEach(flow => {
        const flowId = flow.getAttribute('id');
        if (flowId === `path-${selectedRole}`) {
          flow.classList.add('active');
          // Animate children entrance
          const steps = flow.querySelectorAll('.roadmap-step');
          steps.forEach((step, index) => {
            step.style.opacity = '0';
            step.style.transform = 'translateY(10px)';
            setTimeout(() => {
              step.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
              step.style.opacity = '1';
              step.style.transform = 'translateY(0)';
            }, index * 120);
          });
        } else {
          flow.classList.remove('active');
        }
      });
    });
  });

  // 9. Shopping Cart Toast Notification
  const cartBadge = document.querySelector('.cart-badge');
  const toast = document.getElementById('cart-toast');
  const toastTitle = document.getElementById('ct-course-title');
  const toastClose = document.getElementById('ct-close');
  const addToCartButtons = document.querySelectorAll('.add-to-cart-pop-btn');

  let cartCount = 3; // Initial state

  const triggerToast = (courseName) => {
    if (!toast || !toastTitle) return;
    
    // Update content & counter
    toastTitle.textContent = courseName;
    cartCount++;
    if (cartBadge) cartBadge.textContent = cartCount;

    // Trigger animation
    toast.classList.add('active');

    // Auto dismiss
    setTimeout(() => {
      toast.classList.remove('active');
    }, 4000);
  };

  addToCartButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid triggering card links
      // Traverse up to find course title
      const popover = btn.closest('.course-popover');
      if (popover) {
        const titleEl = popover.querySelector('.popover-title');
        if (titleEl) {
          triggerToast(titleEl.textContent);
        }
      }
    });
  });

  if (toastClose && toast) {
    toastClose.addEventListener('click', () => {
      toast.classList.remove('active');
    });
  }
});
