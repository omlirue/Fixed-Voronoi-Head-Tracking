document.addEventListener('DOMContentLoaded', () => {
    const preview = document.getElementById('preview');
    const allowButton = document.getElementById('allow');
    const denyButton = document.getElementById('deny');

    // Preview camera
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            preview.srcObject = stream;
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
        });

    allowButton.addEventListener('click', () => {
        // Open local index.html in the extension folder
        chrome.tabs.create({ 
            url: chrome.runtime.getURL('index.html'),
            active: true
        }, (tab) => {
            // Optional: Inject content script after tab is created
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        });
        
        window.close();
    });

    denyButton.addEventListener('click', () => {
        window.close();
    });
});