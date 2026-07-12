console.log('Head Tracking Background Script loaded');

// Helper function to check if URL is valid for injection
function isValidUrl(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.type === 'CAMERA_ALLOWED') {
    // Find active tab and inject scripts
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: [
            'content/state.js',
            'content/database.js',
            'content/script.js',
            'content/calibration.js'
          ]
        });
      }
    });

    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open
});

// Handle tab updates to prepare for head tracking
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isValidUrl(tab.url)) {
    console.log('Tab updated and ready for head tracking:', tabId);
    
    // Optional: Inject content scripts if not already injected
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/state.js', 'content/database.js', 'content.js']
    });
  }
});