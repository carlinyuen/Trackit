'use strict';

var trackit = (function() {

  var STATE_START = 1;
  var STATE_ACQUIRING_AUTHTOKEN = 2;
  var STATE_AUTHTOKEN_ACQUIRED = 3;
  var DAYS_IN_ADVANCE = 2;
  var PATH_BACKGROUNDS = 'images/backgrounds/'
  var state = STATE_START;
  // Gangster cache for data
  var userInfo
    , eventList;
  // UI objects
  var labelTitle
    , buttonSignin
    , buttonLogout
    , buttonAddProject
    , navMenu
    , welcomeDialog
    , labelWelcome
    , imageProfile
    , projectPortfolio
  ;

  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  // Utility functions
  function disableButton(button) {
    button.attr('disabled', 'disabled');
  }

  function enableButton(button) {
    button.attr('disabled');
  }

  // Returns a random integer between min (inclusive) and max (inclusive)
  function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
  }



  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  // Change UI based on state
  function changeState(newState) {
    console.log('changeState:', state, 'to', newState);
    state = newState;
    switch (state) {
      case STATE_START:
        enableButton(buttonSignin);
        disableButton(buttonLogout);
        navMenu.fadeOut();
        labelTitle.fadeOut(function() {
          buttonSignin.fadeIn();
          labelWelcome.text('Welcome to Trackit');
          welcomeDialog.fadeIn();
          labelTitle.text('Trackit').fadeIn();
        });
        break;
      case STATE_ACQUIRING_AUTHTOKEN:
        console.log('Acquiring token...');
        disableButton(buttonLogout);
        // disableButton(buttonSignin);
        break;
      case STATE_AUTHTOKEN_ACQUIRED:
        labelTitle.fadeOut();
        buttonSignin.fadeOut(function() {
          navMenu.fadeIn();
          labelTitle.text('Projects')
            .addClass('lead');
          welcomeDialog.delay(3).fadeOut(function() {
            projectPortfolio.fadeIn();
            labelTitle.fadeIn();
          });
          enableButton(buttonLogout);
        });
        break;
    }
  }

  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  // OAuthentication and request handling

  function interactiveSignIn(callback) {
    changeState(STATE_ACQUIRING_AUTHTOKEN);

    chrome.identity.getAuthToken({
      'interactive': true
    }, function(token) {
      if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError);
        console.log('Could not authenticate. :(');
        changeState(STATE_START);
      } else {
        console.log('Token acquired: ' + token +
          '. See chrome://identity-internals for details.');
        callback();
      }
    });
  }

  // Revoke OAuth token
  function revokeToken() {
    console.log('revokeToken');
    chrome.identity.getAuthToken({ 'interactive': false },
      function(current_token) {
        if (!chrome.runtime.lastError) {

          // Remove the local cached token
          chrome.identity.removeCachedAuthToken({
            token: current_token
          }, function() {});

          // Make a request to revoke token in the server
          $.get('https://accounts.google.com/o/oauth2/revoke?token=' + current_token);

          // Update the user interface accordingly
          changeState(STATE_START);
          console.log('Token revoked and removed from cache. '+
            'Check chrome://identity-internals to confirm.');
        }
    });
  }

  // Make an authenticated request, checking for token and getting it otherwise.
  function requestWithAuth(method, url, callback, params) {
    var access_token;
    var retry = true;

    getToken();

    function getToken(interactive) {
      chrome.identity.getAuthToken({
        interactive: interactive
      }, function(token) {
        if (chrome.runtime.lastError) {
          console.log(chrome.runtime.lastError);
          if (callback) {
            callback(null);
          }
          return;
        }

        console.log(token);
        access_token = token;
        requestStart();
      });
    }

    function requestStart() {
      console.log('requestStart:', url);
      $.ajax({
        type: method,
        url: url,
        data: params,
        dataType: 'json',
        headers: { 'Authorization': 'Bearer ' + access_token },
        success: callback,
        error: requestError
      });
    }

    function requestError() {
      console.log('request error!');
      if (retry) {
        retry = false;
        chrome.identity.removeCachedAuthToken({
          token: access_token
        }, getToken)
      } else if (callback) {
        callback(null);
      }
    }
  }

  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  // Google API calls

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
      onUserInfoFetched,
      {
        'requestMask.includeField': 'person.names,person.photos'
      });
  }

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

  // Setup progressbars
  function getProgress() {
    populateProgress();
  }

  // Get all relevant information
  function getData() {
    if (!userInfo) {
      getUserInfo();
    } else {
      onUserInfoFetched(userInfo);
    }
    if (!eventList) {
      // getEvents();
    } else {
      onEventsFetched(eventList);
    }
    // getProgress();
  }

  ///////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  // UI Related

  // Set pretty background
  function lazyloadBackground() {
    var backgrounds = [
      'andreas-ronningen-31469.jpg',
      'brooke-lark-96398.jpg',
      'james-padolsey-152010.jpg',
      'john-towner-154060.jpg',
      'matt-howard-248418.jpg',
      'web-agency-29200.jpg',
    ];
    var bgURL = chrome.extension.getURL(PATH_BACKGROUNDS + backgrounds[getRandomInt(0, backgrounds.length - 1)]);
    var bg = new Image();
    bg.src = bgURL;
    $(bg).on('load', function() {
      $('.background').css('background-image', 'url(' + $(this).attr('src') + ')').addClass('loaded');
    });
  }

  // Populate user info
  function populateUserInfo(user_info) {
    if (!user_info) return;
    labelWelcome.text('Hello, ' + user_info.names[0].givenName + '!');
    if (!user_info.photos[0]) return;
    imageProfile
    .css('background-image', 'url(' + user_info.photos[0].url + ')')
    .addClass('loaded');
  }

  // Populate progressbar
  function populateProgress(progressbar, data) {
    console.log('populateProgress:', data);
    if (progressbar) {
      progressbar.progressbar({
        warningMarker: Math.round(data.complete / data.total * 100),
        dangerMarker: Math.round(data.inProgress / data.total * 100),
        maximum: 100,
      });
      setTimeout(function() {
        progressbar.progressbar('setPosition', 100);
      }, 1000);
    }
  }

  // Create a project and add hooks
  function showAddProjectDialog() {

  }



  return {
    onload: function() {
      lazyloadBackground();

      labelTitle = $('.title');
      navMenu = $('.menu');
      imageProfile = $('.profile');
      buttonSignin = $('.signin');
      buttonLogout = $('.logout');
      welcomeDialog = $('.welcome');
      labelWelcome = $('.welcome .lead');
      projectPortfolio = $('.projects');
      buttonAddProject = $('.addProject');

      // Button handlers
      buttonSignin.click(function(e) {
        e.preventDefault();
        interactiveSignIn(getData);
      });
      buttonLogout.click(revokeToken);
      buttonAddProject.click(showAddProjectDialog);

      // Fanciness
      $('.flip-container').hover(function() {
        $(this).addClass('hover');
      }, function() {
        $(this).removeClass('hover');
      });

      getData();
    }
  };

})();

window.onload = trackit.onload;
