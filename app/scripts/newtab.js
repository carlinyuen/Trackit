
function startup() {

  checkToken(false);
}

function checkToken(interactive) {

  chrome.identity.getAuthToken({ 'interactive': interactive }, function(token) {
    if (chrome.runtime.lastError) {
      console.log(chrome.runtime.lastError);
      $('#signin').click(function() {
        checkToken(true);
      });
      return;
    }

    // Use the token.
    console.log(token);
    $('#signin').hide();
  });

}

startup();
