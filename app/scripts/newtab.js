'use strict';

var googlePlusUserLoader = (function() {

  var STATE_START=1;
  var STATE_ACQUIRING_AUTHTOKEN=2;
  var STATE_AUTHTOKEN_ACQUIRED=3;
  var state = STATE_START;
  var buttonSignin, labelWelcome;

  function disableButton(button) {
    button.attr('disabled', 'disabled');
  }

  function enableButton(button) {
    button.attr('disabled');
  }

  function changeState(newState) {
    state = newState;
    switch (state) {
      case STATE_START:
        enableButton(buttonSignin);
        break;
      case STATE_ACQUIRING_AUTHTOKEN:
        console.log('Acquiring token...');
        disableButton(buttonSignin);
        break;
      case STATE_AUTHTOKEN_ACQUIRED:
        buttonSignin.fadeOut(function() {this.remove();});
        break;
    }
  }

  // Make an authenticated request, checking for token and getting it otherwise.
  function requestWithAuth(method, url, interactive, callback) {
    var access_token;
    var retry = true;

    getToken();

    function getToken() {
      chrome.identity.getAuthToken({
        interactive: interactive
      }, function(token) {
        if (chrome.runtime.lastError) {
          callback(chrome.runtime.lastError);
          return;
        }

        console.log(token);
        access_token = token;
        requestStart();
      });
    }

    function requestStart() {
      $.ajax({
        type: method,
        url: url,
        headers: {
          "Authorization": 'Bearer ' + access_token
        }
      }, function(data) {callback(data);})
        .fail(function() {
          console.log("FAIL");
          retry = false;
          chrome.identity.removeCachedAuthToken({
            token: access_token
          }, getToken)
        });
      // var xhr = new XMLHttpRequest();
      // console.log(access_token);
      // xhr.open(method, url);
      // xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
      // xhr.onload = requestComplete;
      // xhr.send();
    }

    // function requestComplete() {
      // if (this.status == 401 && retry) {
        // retry = false;
        // chrome.identity.removeCachedAuthToken({
        //   token: access_token
        // }, getToken);
      // } else {
        // callback(null, this.status, this.response);
      // }
    // }
  }

  function getEvents(interactive) {
    console.log('getUserInfo:', interactive);
    requestWithAuth('GET',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      interactive,
      onEventsFetched)
  }

  function onEventsFetched(data) {
    console.log('eventsFetched:', data);

  }

  function getUserInfo(interactive) {
    console.log('getUserInfo:', interactive);
    requestWithAuth('GET',
      'https://www.googleapis.com/plus/v1/people/me',
      interactive,
      onUserInfoFetched);
  }

  // Code updating the user interface, when the user information has been
  // fetched or displaying the error.
  function onUserInfoFetched(data) {
    console.log('UserInfoFetched:', data);
    if (data) {
      changeState(STATE_AUTHTOKEN_ACQUIRED);
      populateUserInfo(data);
    } else {
      changeState(STATE_START);
    }
  }

  function populateUserInfo(user_info) {
    if (!user_info) return;
    labelWelcome.text('Hello, ' + user_info.displayName + '!');
    if (!user_info.image || !user_info.image.url) return;
    $(document.createElement('img'))
      .attr('src', user_info.image.url)
      .appendTo(labelWelcome);
  }

  // OnClick event handlers for the buttons.
  function interactiveSignIn(callback) {
    changeState(STATE_ACQUIRING_AUTHTOKEN);

    chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
      if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError);
        alert('Could not authenticate you. :(');
        changeState(STATE_START);
      } else {
        console.log('Token acquired: ' + token +
          '. See chrome://identity-internals for details.');
        changeState(STATE_AUTHTOKEN_ACQUIRED);
        callback();
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

          // Update the user interface accordingly
          changeState(STATE_START);
          console.log('Token revoked and removed from cache. '+
            'Check chrome://identity-internals to confirm.');
        }
    });
  }

  // Get all relevant information
  function getData() {
    getUserInfo();
    getEvents();
  }

  return {
    onload: function() {
      buttonSignin = $('button.signin');
      buttonSignin.click(function() { interactiveSignIn(getData); });
      labelWelcome = $('.welcome');
      getData();
    }
  };

})();

window.onload = googlePlusUserLoader.onload;
