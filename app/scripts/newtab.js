
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

var CLIENT_ID = '26398682427-3qaoo84dciq63ohj46l9dq8gfjqc6r6o.apps.googleusercontent.com';
    // '693999850130-8nk5le2hgvadjmf7qru59ec4nmp2k6m4.apps.googleusercontent.com';
var SCOPES = 'https://www.googleapis.com/auth/buganizer';
function handleClientLoad() {
  gapi.auth.authorize({client_id: CLIENT_ID, scope: SCOPES, immediate: true},
    handleAuthResult);
}
startup();
