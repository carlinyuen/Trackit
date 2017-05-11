'use strict';

var googlePlusUserLoader = (function() {

  var STATE_START=1;
  var STATE_ACQUIRING_AUTHTOKEN=2;
  var STATE_AUTHTOKEN_ACQUIRED=3;
  var state = STATE_START;

  function disableButton(button) {
    button.setAttribute('disabled', 'disabled');
  }

  function enableButton(button) {
    button.removeAttribute('disabled');
  }

  function changeState(newState) {
    state = newState;
    switch (state) {
      case STATE_START:
        enableButton(signin_button);
        break;
      case STATE_ACQUIRING_AUTHTOKEN:
        sampleSupport.log('Acquiring token...');
        disableButton($('button.signin'));
        break;
      case STATE_AUTHTOKEN_ACQUIRED:
        $('button.signin').fadeOut(function() {this.remove();});
        break;
    }
  }

  // Make an authenticated request, checking for token and getting it otherwise.
  function requestWithAuth(method, url, interactive, callback) {
    var access_token;
    var retry = true;

    getToken();

    function getToken() {
      chrome.identity.getAuthToken({ interactive: interactive }, function(token) {
        if (chrome.runtime.lastError) {
          callback(chrome.runtime.lastError);
          return;
        }

        access_token = token;
        requestStart();
      });
    }

    function requestStart() {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
      xhr.onload = requestComplete;
      xhr.send();
    }

    function requestComplete() {
      if (this.status == 401 && retry) {
        retry = false;
        chrome.identity.removeCachedAuthToken({ token: access_token },
                                              getToken);
      } else {
        callback(null, this.status, this.response);
      }
    }
  }

  function getEvents() {
    requestWithAuth('GET',
                'https://www.googleapis.com/calendar/v3/calendars/primary/events',
                false,
                onEventsFetched)
  }

  function getUserInfo(interactive) {
    requestWithAuth('GET',
                'https://www.googleapis.com/plus/v1/people/me',
                interactive,
                onUserInfoFetched);
  }

  // Code updating the user interface, when the user information has been
  // fetched or displaying the error.
  function onUserInfoFetched(error, status, response) {
    if (!error && status == 200) {
      changeState(STATE_AUTHTOKEN_ACQUIRED);
      sampleSupport.log(response);
      var user_info = JSON.parse(response);
      populateUserInfo(user_info);
    } else {
      changeState(STATE_START);
    }
  }

  function populateUserInfo(user_info) {
    labelWelcome.innerHTML = 'Hello ' + user_info.displayName;
    fetchImageBytes(user_info);
  }

  function fetchImageBytes(user_info) {
    if (!user_info || !user_info.image || !user_info.image.url) return;
    $.get(user_info.image.url, onImageFetched);
    // var xhr = new XMLHttpRequest();
    // xhr.open('GET', user_info.image.url, true);
    // xhr.responseType = 'blob';
    // xhr.onload = onImageFetched;
    // xhr.send();
  }

  function onImageFetched(e) {
    if (this.status != 200) return;
    var imgElem = document.createElement('img');
    var objUrl = window.webkitURL.createObjectURL(this.response);
    imgElem.src = objUrl;
    imgElem.onload = function() {
      window.webkitURL.revokeObjectURL(objUrl);
    }
    labelWelcome.insertAdjacentElement('afterbegin', imgElem);
  }

  // OnClick event handlers for the buttons.
  function interactiveSignIn() {
    changeState(STATE_ACQUIRING_AUTHTOKEN);

    chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
      if (chrome.runtime.lastError) {
        sampleSupport.log(chrome.runtime.lastError);
        changeState(STATE_START);
      } else {
        sampleSupport.log('Token acquired:'+token+
          '. See chrome://identity-internals for details.');
        changeState(STATE_AUTHTOKEN_ACQUIRED);
      }
    });
  }

  function revokeToken() {
    labelWelcome.innerHTML='';
    chrome.identity.getAuthToken({ 'interactive': false },
      function(current_token) {
        if (!chrome.runtime.lastError) {

          // Remove the local cached token
          chrome.identity.removeCachedAuthToken({ token: current_token },
            function() {});

          // Make a request to revoke token in the server
          $.get('https://accounts.google.com/o/oauth2/revoke?token=' + current_token);
          // var xhr = new XMLHttpRequest();
          // xhr.open('GET', 'https://accounts.google.com/o/oauth2/revoke?token=' +
          //          current_token);
          // xhr.send();

          // Update the user interface accordingly
          changeState(STATE_START);
          sampleSupport.log('Token revoked and removed from cache. '+
            'Check chrome://identity-internals to confirm.');
        }
    });
  }



  return {
    onload: function() {
      buttonSignin = $('button.signin');
      buttonSignin.click(function() { getUserInfo(true); });
      labelWelcome = $('.welcome');
      getUserInfo(false);
    }
  };

})();

window.onload = googlePlusUserLoader.onload;
