// Toggle Menu Mobile
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content');
    const body = document.body;

    // Buat elemen overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    body.appendChild(overlay);

    // Toggle menu saat tombol diklik
    mobileMenuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        content.classList.toggle('sidebar-active');
    });

    // Tutup menu saat overlay diklik
    overlay.addEventListener('click', function() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        content.classList.remove('sidebar-active');
    });

    // Tutup menu saat klik di luar sidebar
    document.addEventListener('click', function(e) {
        if (!sidebar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            content.classList.remove('sidebar-active');
        }
    });
}); 
