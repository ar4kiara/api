document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.querySelector('.mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content');
    let overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Toggle sidebar saat tombol diklik
    toggleButton.addEventListener('click', function() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        content.classList.toggle('sidebar-active');
    });

    // Tutup sidebar saat mengklik overlay
    overlay.addEventListener('click', function() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        content.classList.remove('sidebar-active');
    });
}); 
