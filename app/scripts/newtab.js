'use strict';

var googlePlusUserLoader = (function() {

  var STATE_START = 1;
  var STATE_ACQUIRING_AUTHTOKEN = 2;
  var STATE_AUTHTOKEN_ACQUIRED = 3;
  var DAYS_IN_ADVANCE = 2;
  var state = STATE_START;
  var userInfo, eventList;
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
  function requestWithAuth(method, url, callback, params) {
    var access_token;
    var retry = true;

    getToken();

    function getToken() {
      chrome.identity.getAuthToken({
        interactive: false
      }, function(token) {
        if (chrome.runtime.lastError) {
          callback(null);
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
        data: params,
        dataType: 'json',
        headers: { 'Authorization': 'Bearer ' + access_token },
        success: callback,
        error: function() {
          console.log('FAIL');
          if (retry) {
            retry = false;
            chrome.identity.removeCachedAuthToken({
              token: access_token
            }, getToken)
          } else {
            callback(null);
          }
        }
      });
    }
  }

  function getEvents() {
    console.log('getEventInfo:');
    var startDate = new Date(), endDate = new Date();
    endDate.setDate(endDate.getDate() + DAYS_IN_ADVANCE);
    endDate.setHours(24,0,0,0);
    requestWithAuth('GET',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      onEventsFetched,
      {
        timeMax: endDate.toISOString(),
        timeMin: startDate.toISOString(),
      });
  }

  function onEventsFetched(data) {
    console.log('eventsFetched:', data);
    if (data) {
      eventList = data;
    }
  }

  function getUserInfo() {
    console.log('getUserInfo:');
    requestWithAuth('GET',
      'https://people.googleapis.com/v1/people/me',
      onUserInfoFetched);
  }

  // Code updating the user interface, when the user information has been
  // fetched or displaying the error.
  function onUserInfoFetched(data) {
    console.log('UserInfoFetched:', data);
    if (data) {
      changeState(STATE_AUTHTOKEN_ACQUIRED);
      userInfo = data;
      populateUserInfo(data);
    } else {
      changeState(STATE_START);
    }
  }

  function populateUserInfo(user_info) {
    if (!user_info) return;
    labelWelcome.text('Hello, ' + user_info.names[0] + '!');
    if (!user_info.photos[0]) return;
    $(document.createElement('img'))
      .attr('src', user_info.photos[0].url)
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
    if (!userInfo) {
      getUserInfo();
    }
    if (!eventList) {
      getEvents();
    }
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
