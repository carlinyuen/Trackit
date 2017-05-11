
function startup() {
  checkToken(false);
}

function checkToken(interactive) {
  chrome.identity.getAuthToken({
    'interactive': interactive
  }, function(token) {
    if (chrome.runtime.lastError) {
      console.log(chrome.runtime.lastError);
      $(document.createElement('button'))
        .text('Sign in!')
        .addClass('signin')
        .appendTo('body')
        .click(function() {
          checkToken(true);
        });
      return;
    }

    // Use the token.
    console.log(token);
    $('button.signin').hide();
  });

}

startup();
