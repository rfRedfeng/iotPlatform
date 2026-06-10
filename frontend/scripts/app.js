// IoT Cloud Platform - Frontend Entry Point
// This file will be expanded with routing and page management

console.log('IoT Cloud Platform Frontend Loaded');

// Simple client-side routing
function navigateTo(page) {
    const content = document.getElementById('page-content');
    if (!content) return;

    const routes = {
        '/dashboard': '<h2>Dashboard</h2><p>Device overview and metrics</p>',
        '/devices': '<h2>Devices</h2><p>Device management interface</p>',
        '/users': '<h2>Users</h2><p>User management interface</p>',
        '/areas': '<h2>Areas</h2><p>Area management interface</p>',
        '/alerts': '<h2>Alerts</h2><p>Alert rules and events</p>'
    };

    content.innerHTML = routes[page] || '<h2>Page Not Found</h2>';
}

// Handle navigation clicks
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const path = new URL(link.href).pathname;
            navigateTo(path);
        });
    });

    // Load dashboard by default
    navigateTo('/dashboard');
});

export { navigateTo };