(function() {
  const params = new URLSearchParams(window.location.search);
  const mode = (params.get('mode') || 'user').toLowerCase();

  window.isTestMode = function() {
    return mode === 'test';
  };

  window.isUserMode = function() {
    return mode !== 'test';
  };
})();