'use strict';

var trackit = (function() {

  var STATE_START = 1;
  var STATE_ACQUIRING_AUTHTOKEN = 2;
  var STATE_AUTHTOKEN_ACQUIRED = 3;
  var DAYS_IN_ADVANCE = 2;
  var PATH_BACKGROUNDS = 'images/backgrounds/'
  var DRIVE_THUMBNAIL_PATH = 'https://lh3.google.com/u/0/d/';
  var state = STATE_START;
  // Gangster cache for data
  var userInfo
    , eventList
    , projectsList;
  // UI objects
  var navMenu
    , labelTitle
    , labelWelcome
    , buttonSignin
    , buttonLogout
    , buttonAddProject
    , buttonAddProjectInput
    , buttonSubmitAddProjectForm
    , addProjectForm
    , welcomeDialog
    , imageProfile
    , projectsContainer
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

  // Create and show modal popup with action button
  // @param content should be html
  function showModalPopup(content, isConfirm, completionBlock)
  {
    // Create background layer
    $(document.createElement('div'))
      .addClass('customModal')
      .hide()
      .appendTo('body')
      .fadeIn()
      .click(function() {
        $('.popup').fadeOut(function()
        {
          $('.popup, .modal').remove();
          if (completionBlock) {
            completionBlock(false);
          }
        });
      });

    // Create actual popup
    $(document.createElement('div'))
      .addClass('popup')
      .append($(document.createElement('h2'))
        .text(chrome.i18n.getMessage('TITLE_WARNING_POPUP'))
      )
      .append($(document.createElement('div'))
        // .html(message.replace(/\n/g, '<br />'))
        .html(content)
      )
      .append($(document.createElement('span'))
        .css('float', 'right')
        .css('text-align', 'right')
        .append($(document.createElement('button'))
          .attr('type', 'button')
          .addClass('btn btn-default')
          .css('display', (isConfirm ? 'inline-block' : 'none'))
          .text('Cancel')
          .click(function()
          {
            $('.popup').fadeOut(function() {
              $('.popup, .customModal').remove();
              if (completionBlock) {
                completionBlock(false);
              }
            });
          })
        )
        .append($(document.createElement('button'))
          .attr('type', 'button')
          .addClass('btn btn-primary')
          .css('margin-left', '4px')
          .text('Ok')
          .click(function()
          {
            $('.popup').fadeOut(function() {
              $('.popup, .customModal').remove();
              if (completionBlock) {
                completionBlock(true);
              }
            });
          })
        )
      )
      .hide()
      .appendTo('body')
      .fadeIn();
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
            projectsContainer.fadeIn();
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

  // function interactiveSignIn(callback) {
  //   changeState(STATE_ACQUIRING_AUTHTOKEN);
  //
  //   chrome.identity.getAuthToken({
  //     'interactive': true
  //   }, function(token) {
  //     if (chrome.runtime.lastError) {
  //       console.log(chrome.runtime.lastError);
  //       console.log('Could not authenticate. :(');
  //       changeState(STATE_START);
  //     } else {
  //       console.log('Token acquired: ' + token +
  //         '. See chrome://identity-internals for details.');
  //       callback();
  //     }
  //   });
  // }

  // // Revoke OAuth token
  // function revokeToken() {
  //   console.log('revokeToken');
  //   chrome.identity.getAuthToken({ 'interactive': false },
  //     function(current_token) {
  //       if (!chrome.runtime.lastError) {
  //
  //         // Remove the local cached token
  //         chrome.identity.removeCachedAuthToken({
  //           token: current_token
  //         }, function() {});
  //
  //         // Make a request to revoke token in the server
  //         $.get('https://accounts.google.com/o/oauth2/revoke?token=' + current_token);
  //
  //         // Update the user interface accordingly
  //         changeState(STATE_START);
  //         console.log('Token revoked and removed from cache. '+
  //           'Check chrome://identity-internals to confirm.');
  //       }
  //   });
  // }

  // Make an authenticated request, checking for token and getting it otherwise.
  // function requestWithAuth(method, url, callback, params) {
  //   var access_token;
  //   var retry = true;
  //
  //   getToken();
  //
  //   function getToken(interactive) {
  //     chrome.identity.getAuthToken({
  //       interactive: interactive
  //     }, function(token) {
  //       if (chrome.runtime.lastError) {
  //         console.log('requestWithAuth:', chrome.runtime.lastError);
  //         if (callback) {
  //           callback(null);
  //         }
  //         return;
  //       }
  //
  //       console.log(token);
  //       access_token = token;
  //       requestStart();
  //     });
  //   }
  //
  //   function requestStart() {
  //     console.log('requestStart:', url);
  //     $.ajax({
  //       type: method,
  //       url: url,
  //       data: params,
  //       dataType: 'json',
  //       headers: { 'Authorization': 'Bearer ' + access_token },
  //       success: callback,
  //       error: requestError
  //     });
  //   }
  //
  //   function requestError() {
  //     console.log('request error!');
  //     if (retry) {
  //       retry = false;
  //       chrome.identity.removeCachedAuthToken({
  //         token: access_token
  //       }, getToken)
  //     } else if (callback) {
  //       callback(null);
  //     }
  //   }
  // }

  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  // Google API calls

  // function getEvents() {
  //   console.log('getEventInfo:');
  //   var startDate = new Date(), endDate = new Date();
  //   endDate.setDate(endDate.getDate() + DAYS_IN_ADVANCE);
  //   endDate.setHours(24,0,0,0);
  //   requestWithAuth('GET',
  //     'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  //     onEventsFetched,
  //     {
  //       timeMax: endDate.toISOString(),
  //       timeMin: startDate.toISOString(),
  //     });
  // }
  //
  // function onEventsFetched(data) {
  //   console.log('eventsFetched:', data);
  //   if (data) {
  //     eventList = data;
  //     populateEvents(data);
  //   }
  // }

  // function getUserInfo() {
  //   console.log('getUserInfo:');
  //   requestWithAuth('GET',
  //     'https://people.googleapis.com/v1/people/me',
  //     onUserInfoFetched,
  //     {
  //       'requestMask.includeField': 'person.names,person.photos'
  //     });
  // }
  //
  // function onUserInfoFetched(data) {
  //   console.log('UserInfoFetched:', data);
  //   if (data) {
  //     changeState(STATE_AUTHTOKEN_ACQUIRED);
  //     userInfo = data;
  //     populateUserInfo(data);
  //   } else {
  //     changeState(STATE_START);
  //   }
  // }

  // Get current project list
  function getProjects(callback) {
    // Fetch from chrome extension sync storage
    chrome.storage.sync.get(null, function(data)
    {
      if (chrome.runtime.lastError) {	// Check for errors
        console.log(chrome.runtime.lastError);
        alert('Error retrieving projects!');
        callback(null);
        return;
      }

      if (!Object.keys(data).length) {
        data = null;
      }
      projectsList = data;
      console.log('projects:', data);
      callback(data);
    });
  }

  // Load all the data for a project
  function loadProjects() {
    console.log('loadProjects');

    // Clear list
    $('.project').remove();
    console.log('PROCESSING:', projectsList);

    // Render the basic list
    $.each(projectsList, function(name, proj) {
      console.log(name, proj);
      var el = $(document.createElement('div'))
        .addClass('project row')
        .attr('data-projectid', name)
        .append($(document.createElement('h3'))
          .addClass('projectName col-md-2')
          .append($(document.createElement('span'))
            .addClass('label label-' + proj.color)
            .text(name)
          )
          .append($(document.createElement('button'))
            .addClass('removeProject btn btn-xs')
            .html('<span class="glyphicon glyphicon-trash" aria-hidden="true"></span>')
            .click(function() {
              var projectID = $(this).parents('.project').attr('data-projectid');
              showModalPopup('Are you sure you want to remove this project?', true, function(confirm) {
                if (confirm) {
                  removeProject(projectID);
                }
              });
            })
          )
        )
      projectPortfolio.append(el);
    });
  }

  // Remove a project
  function removeProject(projectIDs) {
    console.log('removeProject:', projectIDs);

    // Remove specific project
    chrome.storage.sync.remove(projectIDs, function() {
      if (chrome.runtime.lastError) {	// Check for errors
        console.log(chrome.runtime.lastError);
        alert('Could not remove project. Please refresh.');
        return;
      }
      loadProjects();
    });
  }

  // Setup progressbars
  function getProgress() {
    populateProgress();
  }

  // Get all relevant information
  function getData() {
    // if (!userInfo) {
    //   getUserInfo();
    // } else {
    //   onUserInfoFetched(userInfo);
    // }
    // if (!eventList) {
    //   getEvents();
    // } else {
    //   onEventsFetched(eventList);
    // }
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

  // Populate event info
  // function populateEvents(data) {
  //   var prev
  //     , prevStart
  //     , prevEnd
  //     , upcoming
  //     , upcomingStart
  //     , upcomingEnd
  //     , now = new Date()
  //   ;
  //
  //   $.each(data.items, function(i, el) {
  //     // Update latest event that passed
  //     var date = new Date(Date.parse(el.end.dateTime));
  //     if (!prev && date < now) {
  //       prev = el;
  //     }
  //     else if (prev) {
  //       prevEnd = new Date(Date.parse(prev.end.dateTime));
  //       if (date < now && prev && prevEnd < date) {
  //         prev = el;
  //       }
  //     }
  //     // Update nearest upcoming event
  //     date = new Date(Date.parse(el.start.dateTime));
  //     if (!upcoming && date > now) {
  //       upcoming = el;
  //     } else if (upcoming) {
  //       upcomingStart = new Date(Date.parse(upcoming.start.dateTime));
  //       if (date > now && upcoming && upcomingStart > date) {
  //         upcoming = el;
  //       }
  //     }
  //   });
  //   console.log('most recent event:', prev);
  //   console.log('upcoming event:', upcoming);
  //
  //   // Update event UI
  //   if (prev) {
  //     prevStart = new Date(Date.parse(prev.start.dateTime));
  //     $('.events .previous .panel-title')
  //       .append($(document.createElement('a'))
  //         .attr('href', prev.htmlLink)
  //         .attr('target', '_blank')
  //         .text(prev.summary)
  //       ).append('<br>').append($(document.createElement('small'))
  //         .text(prevStart.toLocaleTimeString() + ' to ' + prevEnd.toLocaleTimeString())
  //       );
  //   } else {
  //     $('.events .previous').fadeOut();
  //   }
  //   if (upcoming) {
  //     upcomingEnd = new Date(Date.parse(upcoming.end.dateTime));
  //     var $e = $('.events .upcoming');
  //
  //     // Header
  //     $e.find('.panel-title')
  //       .append($(document.createElement('a'))
  //         .attr('href', upcoming.htmlLink)
  //         .attr('target', '_blank')
  //         .text(upcoming.summary)
  //       ).append('<br>').append($(document.createElement('small'))
  //         .text(upcomingStart.toLocaleTimeString() + ' to ' + upcomingEnd.toLocaleTimeString())
  //       )
  //     ;
  //
  //     // Hangouts link
  //     if (upcoming.hangoutLink) {
  //       var el = $(document.createElement('div'))
  //         .addClass('pull-right')
  //         .append($(document.createElement('span'))
  //           .addClass('alert-success glyphicon glyphicon-facetime-video')
  //         ).append($(document.createElement('a'))
  //           .attr('href', upcoming.hangoutLink)
  //           .attr('target', '_blank')
  //           .text(' Hangouts link')
  //         )
  //       ;
  //       $e.find('.panel-body').append(el);
  //     }
  //
  //     // Description
  //     if (upcoming.description) {
  //       var el = $(document.createElement('p'))
  //         .text(upcoming.description);
  //       $e.find('.panel-body').append(el);
  //     }
  //
  //     // Attachments
  //     if (upcoming.attachments) {
  //       var el = $(document.createElement('div'))
  //         .addClass('attachments');
  //       $.each(upcoming.attachments, function(i, obj) {
  //         $(document.createElement('div'))
  //           .addClass('file')
  //           .attr('data-fileID', obj.fileId)
  //           .append($(document.createElement('img'))
  //             .addClass('thumbnail')
  //             .attr('src', DRIVE_THUMBNAIL_PATH + obj.fileId)
  //           )
  //           .append($(document.createElement('span'))
  //             .addClass('fileTitle')
  //             .append($(document.createElement('a'))
  //               .attr('href', obj.fileUrl)
  //               .attr('target', '_blank')
  //               .text(' ' + obj.title)
  //               .prepend($(document.createElement('img'))
  //                 .attr('src', obj.iconLink)
  //               )
  //             )
  //           )
  //           .appendTo(el);
  //         fetchBadgesForFile(obj.fileId);  // Async get badges
  //       });
  //       $e.find('.panel-body').append(el);
  //     }
  //   } else {
  //     $('.events .upcoming').fadeOut();
  //   }
  //
  //   // Show UI
  //   $('.events').fadeIn();
  // }

  // Get badges for a file to show
  function fetchBadgesForFile(fileID) {

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

  // Add more input fields for the project
  function addInputFields() {
    var fields = ($(document.createElement('div')).addClass('form-group extraInputFields'));
    fields.html('\
    <div class="col-sm-offset-2 col-sm-10">\
      <select class="form-control inputSource">\
        <option>Drive</option>\
        <option>Gmail</option>\
        <option>Buganizer</option>\
      </select>\
      <input type="text" class="form-control inputString" placeholder="Drive link, Gmail label name, Buganizer hotlist ID">\
    </div>');
    $('#addInputFields').before(fields);
    $('.inputSource').last().focus();
  }

  // Collect data from addProject form
  function getProjectInputs() {
    var name = $('#inputName').val();
    var color = $('#inputColor').val().trim().toLowerCase();
    var inputs = []
      , sources = $('.inputSource')
      , strings = $('.inputString')
    ;

    // Clear all previous validation errors before moving forward
    $('.form-group').removeClass('has-error');
    // Check project name
    if (!name || name == '') {
      $('#inputName').parents('.form-group').addClass('has-error');
    }
    if (strings.length == 1 && strings[0].value.trim() == '') {
      strings.parents('.form-group').addClass('has-error');
    }
    if (projectsList && projectsList[name]) {
      $('#inputName').parents('.form-group').addClass('has-error');
      alert('Project name already exists.');
    }
    // Exit early
    if ($('.form-group').hasClass('has-error')) {
      return;
    }

    // Print and parse
    console.log(sources);
    console.log(strings);
    for (var i = 0, l = sources.length, d = {}; i < l - 1; i++, d = {}) {
      d[sources[i].value] = strings[i].value;
      inputs.push(d);
    }
    console.log(inputs);
    $('#modal').modal('hide');

    var data = {
      name: name,
      inputs: inputs,
      color: color
    };
    return data;
  }

  // Clear extra input fields for project modal
  function clearExtraInputFields() {
    $('.extraInputFields').fadeOut(function() {
      $(this).remove();
    });
  }

  // Save fresh projects data -- includes all project data
  function updateProjectsData(data, callback) {
    console.log('updateProjectsData:', data);
    // Save data into storage
    chrome.storage.sync.set(data, function()
    {
      if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError);
        alert('There was an error saving your projects. :(');
        if (callback) {
          callback(false);
        }
      }
      else {
        if (callback) {
          callback(true);
        }
      }
    });
  }

  // Add new project
  function addProject() {
    var data = getProjectInputs();
    console.log('addProject:', data);

    // Get latest projects
    getProjects(function(allProjects) {
      // If DNE, create
      if (!allProjects) {
        allProjects = {};
      }
      allProjects[data.name] = data
      updateProjectsData(allProjects, loadProjects);
    });
  }


  return {
    onload: function() {
      lazyloadBackground();

      navMenu = $('.menu');
      labelTitle = $('.title');
      imageProfile = $('.profile');
      buttonSignin = $('.signin');
      buttonLogout = $('.logout');
      welcomeDialog = $('.welcome');
      labelWelcome = $('.welcome .lead');
      addProjectForm = $('#addProjectForm');
      projectsContainer = $('.projects');
      projectPortfolio = $('.portfolio');
      buttonAddProject = $('.addProject');
      buttonAddProjectInput = $('.addProjectInput');
      buttonSubmitAddProjectForm = $('#submitAddProjectForm');

      // // Button handlers
      // buttonSignin.click(function(e) {
      //   e.preventDefault();
      //   interactiveSignIn();
      //   getData();
      // });
      // buttonLogout.click(revokeToken);
      buttonAddProjectInput.click(addInputFields);

      // Form handler
      buttonSubmitAddProjectForm.click(function(e) {
        console.log('add project form submit');
        addProject();
      });

      // // Feedback rating interactions
      // $('.feedback .rating').hover(function() {
      //   var $t = $(this);
      //   $t.prevAll().addBack().each(function(i, el) {
      //     var $el = $(el);
      //     $el.addClass('glyphicon-star');
      //     $el.removeClass('glyphicon-star-empty');
      //   });
      //   $t.nextAll()
      //     .removeClass('glyphicon-star')
      //     .addClass('glyphicon-star-empty');
      // }, function() {
      //   $('.feedback .rating').each(function(i, el) {
      //     var $el = $(el);
      //     if ($el.hasClass('selected')) {
      //       $el.addClass('glyphicon-star');
      //       $el.removeClass('glyphicon-star-empty');
      //     } else {
      //       $el.removeClass('glyphicon-star');
      //       $el.addClass('glyphicon-star-empty');
      //     }
      //   });
      // }).on('click', function() {
      //   var $t = $(this);
      //   $t.prevAll().addBack()
      //     .addClass('selected glyphicon-star')
      //     .removeClass('glyphicon-star-empty');
      //   $t.nextAll()
      //     .removeClass('selected glyphicon-star')
      //     .addClass('glyphicon-star-empty');
      // });

      // Fanciness
      $('.flip-container').hover(function() {
        $(this).addClass('hover');
      }, function() {
        $(this).removeClass('hover');
      });

      getProjects(function(data) {
        if (!data) {
          $('.zerostate').fadeIn();
        } else {
          loadProjects();
        }
        changeState(STATE_START);
      });
      getData();
    }
  };

})();

window.onload = trackit.onload;
