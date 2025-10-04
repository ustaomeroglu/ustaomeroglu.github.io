// Mobile menu toggle functionality
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navMenu = document.querySelector('.nav-menu');

mobileMenuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

// Load profile photo
async function loadProfilePhoto() {
    const profileImage = document.getElementById('profileImage');
    const loadingPlaceholder = document.getElementById('loadingPlaceholder');
    
    try {
        // Use the actual profile picture from the images folder
        profileImage.src = 'docs/images/pp.jpeg';
        
        profileImage.onload = function() {
            loadingPlaceholder.style.display = 'none';
            profileImage.style.display = 'block';
        };
        
        profileImage.onerror = function() {
            // Fallback to professional avatar if the image fails to load
            console.log('Profile image not found, using fallback avatar');
            profileImage.src = 'https://ui-avatars.com/api/?name=Muhammed+Ustaomeroglu&size=200&background=0066ff&color=ffffff&font-size=0.4&bold=true';
            loadingPlaceholder.style.display = 'none';
            profileImage.style.display = 'block';
        };
        
    } catch (error) {
        console.log('Using fallback avatar due to error:', error);
        profileImage.src = 'https://ui-avatars.com/api/?name=Muhammed+Ustaomeroglu&size=350&background=0066ff&color=ffffff&font-size=0.4&bold=true';
        loadingPlaceholder.style.display = 'none';
        profileImage.style.display = 'block';
    }
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Load photo when page loads
window.addEventListener('DOMContentLoaded', loadProfilePhoto);

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!mobileMenuToggle.contains(e.target) && !navMenu.contains(e.target)) {
        navMenu.classList.remove('active');
    }
});

// Add scroll effect to navigation
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 100) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
    }
});