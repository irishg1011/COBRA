document.addEventListener('DOMContentLoaded', () => {
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        // Updated path to point inside the components folder
        fetch('components/header.html')
            .then(response => response.text())
            .then(data => { headerPlaceholder.innerHTML = data; })
            .catch(error => console.error('Error loading header:', error));
    }
});