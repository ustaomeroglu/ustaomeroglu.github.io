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
            profileImage.src = 'https://ui-avatars.com/api/?name=Muhammed+Ustaomeroglu&size=300&background=109fb4&color=ffffff&font-size=0.4&bold=true';
            loadingPlaceholder.style.display = 'none';
            profileImage.style.display = 'block';
        };

    } catch (error) {
        console.log('Using fallback avatar due to error:', error);
        profileImage.src = 'https://ui-avatars.com/api/?name=Muhammed+Ustaomeroglu&size=300&background=109fb4&color=ffffff&font-size=0.4&bold=true';
        loadingPlaceholder.style.display = 'none';
        profileImage.style.display = 'block';
    }
}

// Smooth scrolling for in-page anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Close the mobile menu after navigating
            navMenu.classList.remove('active');
        }
    });
});

// Scroll-reveal: fade and slide sections in as they enter the viewport
function initScrollReveal() {
    const revealEls = document.querySelectorAll('.reveal');

    if (!('IntersectionObserver' in window)) {
        revealEls.forEach(el => el.classList.add('in'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealEls.forEach(el => observer.observe(el));
}

// Highlight the nav link of the section currently in view
function initActiveNav() {
    const sections = document.querySelectorAll('#about, #research, #contact');
    const navLinks = document.querySelectorAll('.nav-link');

    if (!('IntersectionObserver' in window) || !sections.length) return;

    const setActive = (id) => {
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        });
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                setActive(entry.target.id);
            }
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(section => observer.observe(section));
}

// Initialize once the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    loadProfilePhoto();
    initScrollReveal();
    initActiveNav();
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!mobileMenuToggle.contains(e.target) && !navMenu.contains(e.target)) {
        navMenu.classList.remove('active');
    }
});

// Add scroll effect to navigation
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 80) {
        navbar.style.background = 'rgba(251, 250, 247, 0.95)';
    } else {
        navbar.style.background = 'rgba(251, 250, 247, 0.85)';
    }
});
