'use strict';

// Prevent conflicts
jQuery.noConflict();
jQuery.hotkeys.options.filterInputAcceptingElements = false;
jQuery.hotkeys.options.filterContentEditable = false;

// Encapsulated anonymous function
(function($) {

  // Variables & Constants
  var KEYCODE_BACKSPACE = 8
    , KEYCODE_TAB = 9
    , KEYCODE_RETURN = 13
    , KEYCODE_SPACEBAR = 32
    , KEYCODE_ESC = 27

    , ANIMATION_FAST = 200
    , ANIMATION_NORMAL = 400
    , ANIMATION_SLOW = 1000
    , TIME_SHOW_CROUTON = 1000 * 2       // Show croutons for 2s
    , WHITESPACE_REGEX = /(\s)/
    , NUM_RECENT_BOOKMARKS = 100        // Cache up to 100 recent bookmarks

    , NAMESPACE = 'trackit'
    , EVENT_NAME_KEYPRESS = 'keypress.' + NAMESPACE
    , EVENT_NAME_KEYDOWN = 'keydown.' + NAMESPACE
    , EVENT_NAME_KEYUP = 'keyup.' + NAMESPACE
    , EVENT_NAME_BLUR = 'blur.' + NAMESPACE
    , EVENT_NAME_CLICK = 'click.' + NAMESPACE
    , EVENT_NAME_FOCUS = 'focus.' + NAMESPACE
    , EVENT_NAME_LOAD = 'load.' + NAMESPACE
    , EVENT_NAME_COPY = 'copy.' + NAMESPACE
    , EVENT_NAME_PASTE = 'paste.' + NAMESPACE
    , EVENT_NAME_INSERTED = 'DOMNodeInserted'

    , SPOTLIGHT_INPUT = '*[contenteditable=true],textarea,input'
    , SPOTLIGHT_SHORTCUT = 'ctrl+space'
    , SPOTLIGHT_ID = NAMESPACE + '-spotlight'
    , SPOTLIGHT_SELECTOR = '#' + SPOTLIGHT_ID
    , SPOTLIGHT_INPUT_CLASS = SPOTLIGHT_ID + '-input'
    , SPOTLIGHT_INPUT_SELECTOR = '.' + SPOTLIGHT_INPUT_CLASS
    , SPOTLIGHT_DATA_CLASS = SPOTLIGHT_ID + '-data'
    , SPOTLIGHT_DATA_SELECTOR = '.' + SPOTLIGHT_DATA_CLASS
    , SPOTLIGHT_LINK_CLASS = SPOTLIGHT_ID + '-link'
    , SPOTLIGHT_LINK_SELECTOR = '.' + SPOTLIGHT_LINK_CLASS

    , SPOTLIGHT_PROJECT_DATA_ATTR = 'data-project'
    , SPOTLIGHT_PROJECT_C = 'COLLABORATION'
    , SPOTLIGHT_PROJECT_E = 'ENGAGE'
    , SPOTLIGHT_PROJECT_H = 'HUDDLE'
    , SPOTLIGHT_TYPE_DATA_ATTR = 'data-type'
    , SPOTLIGHT_TYPE_A = 'actionitem'
    , SPOTLIGHT_TYPE_D = 'decision'
    , SPOTLIGHT_TYPE_U = 'update'
    , SPOTLIGHT_OWNERS_DATA_ATTR = 'data-owners'
    , SPOTLIGHT_LINK_DATA_ATTR = 'data-link'

    , PERSON_DATA = ['carlin', 'sivan', 'anya', 'charles', 'jason', 'matt', 'marie', 'elena', 'adam', 'rob', 'seth']
    , TYPE_DATA = [{
        name: 'AI',
        title: 'Action Item',
      }, {
        name: 'DC',
        title: 'Decision',
      }, {
        name: 'UD',
        title: 'Update'
      }]
    , PROJECT_DATA = ['private', 'engage', 'collaboration', 'huddle']
    , LINK_DATA = [{
        name:'http://go/engage-hack',
        imgsrc: chrome.extension.getURL('images/icon-presentation.png'),
      }, {
        name:'http://go/team-collaboration',
        imgsrc: chrome.extension.getURL('images/icon-document.png'),
      }]

    , URL_XSRF_TOKEN = 'https://huddle.corp.google.com/_/engage/token?rt=j'
    , HEADER_XSRF = 'X-Framework-Xsrf-Token'
    , URL_FAVICON_FETCH = 'https://www.google.com/s2/favicons?domain='
  ;

  var xsrfToken;          // Get token to talk to Engage
  var typingBuffer = [];  // Keep track of what's been typed before timeout
  var shorcutEvent;       // Keep track of shortcut event to prevent re-firing
  var keyPressEvent;      // Keep track of keypress event to prevent re-firing
  var keyUpEvent;         // Keep track of keyup event to prevent re-firing
  var preSpotlightTarget; // Keep track of element focus pre-spotlight
  var bookmarks;          // Cache bookmarks to use for links
  var history;            // Cache recent history to use for links
  var linkAutocomplete;   // Map data for link autocomplete
  var clipboard;          // Keep track of what's in the clipboard
  var copyEvent;          // Keep track if user copied something recently
  var disableShortcuts;   // Flag to disable shortcuts in case of unreliable state
  var guideState = 0;     // Flag to keep track of state of user onboarding

  // When user presses SPOTLIGHT_SHORTCUT
  function activateSpotlight(event) {
    console.log('activateSpotlight()');

    // Make sure it's not the same event firing over and over again
    if (shorcutEvent == event) {
      return;
    } else {
      shorcutEvent = event;
    }

    console.log('copyEvent', copyEvent);

    preSpotlightTarget = event.target;

    // Check if there's already a spotlight bar, and if so, just focus
    var $textInput = $(SPOTLIGHT_INPUT_SELECTOR);
    // getRecentBookmarks(function() {
    getRecentHistory(function() {
      if ($textInput.length > 0) {
        removeLink();
        updateInputWithClipboardSelection($textInput);
        $(SPOTLIGHT_SELECTOR).fadeIn(ANIMATION_FAST, function() {
          $textInput.focus();
        });
      } else {
        addSpotlightBar('body');
      }
    });
  }

  // Add spotlight bar to element
  //  param: elementSelector should be a string
  function addSpotlightBar(elementSelector)
  {
    var d = document;
    $(d.createElement('form'))
      .attr('id', SPOTLIGHT_ID)
      .append($(d.createElement('textarea'))
        .addClass(SPOTLIGHT_INPUT_CLASS)
        .attr('type', 'text')
        .attr('placeholder', chrome.i18n.getMessage('SPOTLIGHT_PLACEHOLDER_ZERO'))
        // .on(EVENT_NAME_BLUR, hideSpotlight)
      )
      .append($(d.createElement('span'))
        .addClass(SPOTLIGHT_DATA_CLASS)
      )
      .append($(d.createElement('div'))
        .addClass(SPOTLIGHT_LINK_CLASS)
      )
      .submit(spotlightSubmit)
      .hide()
      .appendTo(elementSelector)
      .fadeIn(ANIMATION_FAST, function() {
        addListeners(SPOTLIGHT_INPUT_SELECTOR);
        $(SPOTLIGHT_INPUT_SELECTOR).focus();
      });

    // Grow textbox if needed
    var $textInput = $(SPOTLIGHT_INPUT_SELECTOR);
    $textInput.autogrow({
      vertical: true,
      horizontal: false,
      flickering: false,
    });

    updateAutocompletes($textInput);
    updateInputWithClipboardSelection($textInput);
  }

  // When a user pastes into the input field
  function pasteHandler(event) {
    console.log('pasted');

    getClipboardData(function() {
      if (clipboard.urls && clipboard.urls.length > 0) {
        addLink(clipboard.urls[(clipboard.urls.length > 1 ? 1 : 0)]);
      }
    });
  }

  // Update autocompletes for input field
  //  @param $textInput should be a jquery object
  function updateAutocompletes($textInput) {
    // Trigger on keywords
    // var linkMap = $.map(LINK_DATA, function(value, i) {
    //   return {
    //     id: i,
    //     name: value.name,
    //     imgsrc: value.imgsrc
    //   };
    // });
    // if (!bookmarks) {
    //   bookmarks = LINK_DATA;
    // }
    var links = $.merge(history, bookmarks);
    if (!links) {
      links = LINK_DATA;
    }
    linkAutocomplete = $.map(links, function(value, i) {
      return {
        id: i,
        name: value.title,
        url: value.url,
        hostname: new URL(value.url).hostname,
        imgsrc: URL_FAVICON_FETCH + value.url,
      };
    });
    $textInput.atwho({
      at: '@',
      data: PERSON_DATA,
    }).atwho({
      at: 'go/',
      data: linkAutocomplete,
      displayTpl: '<li><img src="${imgsrc}" height="16" width="16"/> ${hostname} : ${name} - ${url}</li>',
      insertTpl: '${url}',
      callbacks: {
        filter: function(query, data, searchKey) {
          // console.log('filter:', query, data, searchKey);
          return $.grep(data, function(value, i) {
            if (value.name.toLowerCase().indexOf('go/' + query.toLowerCase()) >= 0
              || value.url.toLowerCase().indexOf('go/' + query.toLowerCase()) >= 0) {
              return true;
            } else {
              return false;
            }
          });
        },
        beforeInsert: autocompleteUpdateLink,
      }
    }).atwho({
      at: '/',
      data: linkAutocomplete,
      displayTpl: '<li><img src="${imgsrc}" height="16" width="16"/> ${hostname} : ${name} - ${url}</li>',
      insertTpl: '${url}',
      callbacks: {
        beforeInsert: autocompleteUpdateLink
      }
    }).atwho({
      at: ':',
      data: TYPE_DATA,
      displayTpl: '<li>${title}</li>',
      insertTpl: '${name}:',
      callbacks: {
        beforeInsert: autocompleteUpdateType
      }
    }).atwho({
      at: '#',
      data: PROJECT_DATA,
      callbacks: {
        beforeInsert: autocompleteUpdateProject
      }
    });
  }

  // Checks for content in clipboard/selection to add to field
  // Add text in clipboard or selected text, prioritizes selection over clipboard
  function updateInputWithClipboardSelection($textInput) {
    var selectionData = getSelectionHTML(),
      value = $textInput.val();

    // Check if they recently copied first
    if (copyEvent) {
      getClipboardData(function() {
        $textInput.val(clipboard.text);
        if (clipboard.urls && clipboard.urls.length > 0) {
          addLink(clipboard.urls[(clipboard.urls.length > 1 ? 1 : 0)]);
        }
        copyEvent = false;
      });
    }
    else if (selectionData.text)
    {
      $textInput.val(selectionData.text);
      if (selectionData.urls && selectionData.urls.length > 0) {
        addLink(selectionData.urls[(selectionData.urls.length > 1 ? 1 : 0)]);
      }
    }
  }

  // Add link from autocomplete
  function autocompleteUpdateLink(linkURL) {
    console.log('autocompleteUpdateLink:', linkURL);
    addLink(linkURL);    // Add link to links
    return '';      // Do not add to actual input
  }

  // Add link to input
  function addLink(url) {
    console.log('addLink:', url);

    // If url doesn't include domain, include it
    url = getAbsoluteURL(url);
    console.log('absolute url:', url);

    // Add link to links
    var $link = $(SPOTLIGHT_LINK_SELECTOR);
    $link.attr(SPOTLIGHT_LINK_DATA_ATTR, url);
    $link.html([
      ' - ',
      '<img src="' + URL_FAVICON_FETCH + url + '" height="16" width="16"/> ',
      '<a href="' + url + '" target="_blank">' + url + '</a>',
    ]);
    getPageTitleForURL(url, function(name) {
      $link.find('a').text(name.title + ' <' + url + '>');
    });
  }

  // Generates an absolute URL from relative url
  function getAbsoluteURL(href) {
    var link = document.createElement("a");
    link.href = href;
    return (link.protocol+"//"+link.host+link.pathname+link.search+link.hash);
  }

  function removeLink() {
    $(SPOTLIGHT_LINK_SELECTOR).removeAttr(SPOTLIGHT_LINK_DATA_ATTR).html('');
  }

  // Update project data from autocomplete
  function autocompleteUpdateProject(projectName) {
    console.log('autocompleteUpdateProject:', projectName);
    var $textInput = $(SPOTLIGHT_INPUT_SELECTOR);
    if (checkShortcuts(projectName + ' ', ' ', $textInput)) {
      replaceTextRegular(typingBuffer.join(''), '', $textInput[0]);
      updateSpotlightPlaceholderText();
    }
    return '';
  }

  // Update type data from autocomplete
  function autocompleteUpdateType(typeName) {
    console.log('autocompleteUpdateType:', typeName);
    var $textInput = $(SPOTLIGHT_INPUT_SELECTOR);
    if (checkShortcuts(typeName + ' ', ' ', $textInput)) {
      replaceTextRegular(typingBuffer.join(''), '', $textInput[0]);
      updateSpotlightPlaceholderText();
    }
    return '';
  }

  // Hide the spotlight bar
  function hideSpotlight(callback) {
    console.log('hideSpotlight');
    $(SPOTLIGHT_SELECTOR).fadeOut(ANIMATION_FAST, function() {
      // Focus back on pre-spotlight target if exists
      if (preSpotlightTarget) {
        $(preSpotlightTarget).focus();
      }

      // Call callback if it is a function
      if (callback && typeof(callback) === 'function') {
        callback();
      }
    });
  }

  // When user submits spotlight form
  function spotlightSubmit(event) {
    console.log('spotlightSubmit');
    if (event) {
      event.preventDefault(); // prevent page refresh
    }

    var $textInput = $(SPOTLIGHT_INPUT_SELECTOR)
      , type = $(SPOTLIGHT_DATA_SELECTOR).attr(SPOTLIGHT_TYPE_DATA_ATTR)
      , project = $(SPOTLIGHT_SELECTOR).attr(SPOTLIGHT_PROJECT_DATA_ATTR)
      , $link = $(SPOTLIGHT_LINK_SELECTOR)
      , value = $textInput.val()
      , message = [];
    ;

    // Only submit if there's content
    if (value.trim() == '') {
      return;
    }

    // Save to somewhere
      // .attr(SPOTLIGHT_LINK_DATA_ATTR)

    // Clean up
    $textInput.val('');
    $link.html('').removeAttr(SPOTLIGHT_LINK_DATA_ATTR);
    updateOwners();

    switch (type) {
      case SPOTLIGHT_TYPE_A:
        message.push('Action item');
        break;
      case SPOTLIGHT_TYPE_D:
        message.push('Decision');
        break;
      case SPOTLIGHT_TYPE_U:
        message.push('Update');
        break;
    }
    message.push('captured');

    if (project && project != '') {
      message.push('for');
      message.push('#' + project.charAt(0).toUpperCase() + project.toLowerCase().slice(1));
    }

    showCrouton(message.join(' '), true);

    guideState++;
    updateSpotlightPlaceholderText();
  }

  // When user presses a key
  function keyPressHandler(event)
  {
    console.log('keyPressHandler:', event.target);

    // Make sure it's not the same event firing over and over again
    if (keyPressEvent == event) {
      return;
    } else {
      keyPressEvent = event;
    }

    // Get character that was typed
    var charCode = event.keyCode || event.which;
    if (charCode == KEYCODE_SPACEBAR) {
      if (event.target.value === '') {
        event.preventDefault();
        return;
      }
    }
    if (charCode == KEYCODE_RETURN) {	// If return, clear and get out
      clearTypingBuffer();
      if (event.target.value.trim() != '') { // Only submit if there's content
        spotlightSubmit();
      }
      event.preventDefault();
      return;
    }
    // If user hit ESC, close spotlight
    if (charCode == KEYCODE_ESC) {
      hideSpotlight();
      return;
    }

    // Add new character to typing buffer
    var char = String.fromCharCode(charCode);
    typingBuffer.push(char);

    // Check typed text for shortcuts
    // checkShortcuts(typingBuffer.join(''), char, event.target);
    var shortcut = typingBuffer.join('');
    if (checkShortcuts(shortcut, char, event.target)) {
      // Replace text in the input field
      replaceTextRegular(shortcut.trim(), '', event.target);
      updateSpotlightPlaceholderText();
    }
  }

  // When user lifts up on a key, to catch backspace
  function keyUpHandler(event)
  {
    // Clear field if empty
    if (event.target.value === ' ') {
      event.target.value = '';
    }

    // Make sure it's not the same event firing over and over again
    if (keyUpEvent == event) {
      return;
    } else {
      keyUpEvent = event;
    }

    // Update the owners data attribute
    updateOwners(event);

    // Get key that was lifted on
    var charCode = event.keyCode || event.which;

    // If user hit ESC, close spotlight
    if (charCode == KEYCODE_ESC) {
      hideSpotlight();
      return;
    }

    // When user types backspace, pop character off buffer
    if (charCode == KEYCODE_BACKSPACE) {
      // Clear data type if backspacing on empty field
      if (event.target.value === '' && typingBuffer.length === 0) {
        var $spotlight = $(SPOTLIGHT_SELECTOR)
          , $link = $(SPOTLIGHT_LINK_SELECTOR)
          , $dataSpan = $(SPOTLIGHT_DATA_SELECTOR);
        if ($link.attr(SPOTLIGHT_LINK_DATA_ATTR)) {
          removeLink();
          console.log('removed link data attr');
        } else if ($dataSpan.attr(SPOTLIGHT_TYPE_DATA_ATTR)) {
          $dataSpan.removeAttr(SPOTLIGHT_TYPE_DATA_ATTR);
          console.log('removed type data attr');
        } else if ($spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR)) {
          $spotlight.removeAttr(SPOTLIGHT_PROJECT_DATA_ATTR);
          console.log('removed project data attr');
        }
        updateSpotlightPlaceholderText();
      }

      typingBuffer.pop(); // Remove last character typed
    }

    // If user uses tab or return, clear and get out
    if (charCode == KEYCODE_TAB || charCode == KEYCODE_RETURN || event.target.value === '') {
      return clearTypingBuffer();
    }
  }

  // Clears the typing buffer
  function clearTypingBuffer(event) {
    typingBuffer.length = 0;
  }

  // Check for keywords
  function checkShortcuts(shortcut, lastChar, textInput) {
    console.log('checkShortcuts:', lastChar, shortcut);

    var $spotlight = $(SPOTLIGHT_SELECTOR)
      , $dataSpan = $(SPOTLIGHT_DATA_SELECTOR)
      , match = false;
    shortcut = shortcut.toUpperCase();

    switch (shortcut) {
      case 'A: ': // Action item
      case 'AI: ':
      case 'ACTIONITEM: ':
      case 'TODO: ':
      case 'D: ': // Decision
      case 'DC: ':
      case 'DECISION: ':
      case 'U: ': // Update
      case 'UD: ':
      case 'UPDATE: ':
      case '#E ': // Project tag
      case '#ENGAGE ':
      case '#C ':
      case '#COLLAB ':
      case '#COLLABORATION ':
      case '#H ':
      case '#HUDDLE ':
      {
        match = true;

        // Update data attribute
        switch (shortcut) {
          case 'A: ': // Action item
          case 'AI: ':
          case 'ACTIONITEM: ':
          case 'TODO: ':
            $dataSpan.attr(SPOTLIGHT_TYPE_DATA_ATTR, SPOTLIGHT_TYPE_A);
            break;
          case 'D: ': // Decision
          case 'DC: ':
          case 'DECISION: ':
            $dataSpan.attr(SPOTLIGHT_TYPE_DATA_ATTR, SPOTLIGHT_TYPE_D);
            break;
          case 'U: ': // Update
          case 'UD: ':
          case 'UPDATE: ':
            $dataSpan.attr(SPOTLIGHT_TYPE_DATA_ATTR, SPOTLIGHT_TYPE_U);
            break;
          case '#E ': // Project
          case '#ENGAGE ':
            $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR, SPOTLIGHT_PROJECT_E);
            break;
          case '#C ':
          case '#COLLAB ':
          case '#COLLABORATION ':
            $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR, SPOTLIGHT_PROJECT_C);
            break;
          case '#H ':
          case '#HUDDLE ':
            $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR, SPOTLIGHT_PROJECT_H);
            break;
        }
      }
      break;
    }

    // If last character is whitespace, clear buffer
    if (WHITESPACE_REGEX.test(lastChar)) {
      clearTypingBuffer();
    }

    return match;
  }

  // Update owners section if there's any owners set
  function updateOwners(event) {
    // console.log('updateOwners');
    var text = $(SPOTLIGHT_INPUT_SELECTOR).val();
    var matches = text.match(/(@\w+)/g);
    // console.log(matches);
    if (matches) {
      $(SPOTLIGHT_DATA_SELECTOR).attr(SPOTLIGHT_OWNERS_DATA_ATTR, matches.join(', '));
    } else {
      $(SPOTLIGHT_DATA_SELECTOR).removeAttr(SPOTLIGHT_OWNERS_DATA_ATTR);
    }
  }

  // Update placeholder text to guide users based on state
  function updateSpotlightPlaceholderText() {
    var $spotlight = $(SPOTLIGHT_SELECTOR)
      , $dataSpan = $(SPOTLIGHT_DATA_SELECTOR)
      , $textInput = $(SPOTLIGHT_INPUT_SELECTOR)
      , hasType = $dataSpan.attr(SPOTLIGHT_TYPE_DATA_ATTR)
      , hasProject = $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR)
      , messageCode
    ;

    switch (guideState) {
      case 0: messageCode = 'SPOTLIGHT_PLACEHOLDER_ZERO'; break;
      case 1: messageCode = 'SPOTLIGHT_PLACEHOLDER_ONE'; break;
      case 2: messageCode = 'SPOTLIGHT_PLACEHOLDER_TWO'; break;
      case 3: messageCode = 'SPOTLIGHT_PLACEHOLDER_THREE'; break;
      case 4: messageCode = 'SPOTLIGHT_PLACEHOLDER_FOUR'; break;
      case (hasType && hasProject):
        messageCode = 'SPOTLIGHT_PLACEHOLDER_BOTH'; break;
      case (hasType): messageCode = 'SPOTLIGHT_PLACEHOLDER_TYPE'; break;
      case (hasProject): messageCode = 'SPOTLIGHT_PLACEHOLDER_PROJECT'; break;
    }

    $textInput.attr('placeholder', chrome.i18n.getMessage(messageCode));
  }

  // // Check to see if text in argument corresponds to any shortcuts
  // function checkShortcuts(shortcut, lastChar, textInput)
  // {
  //   console.log('checkShortcuts:', lastChar, shortcut);
  //
  //   var isAllCaps = (shortcut == shortcut.toUpperCase());   // Check for all caps
  //   var shortcutKey = SHORTCUT_PREFIX + shortcut;           // Key for expansion
  //   var shortcutKeyLowercase = SHORTCUT_PREFIX + shortcut.toLowerCase(); // For auto-capitalization
  //
  //   // Get shortcuts
  //   chrome.storage.sync.get(shortcutKey, function (data)
  //   {
  //     // Check for errors
  //     if (chrome.runtime.lastError) {
  //       console.log(chrome.runtime.lastError);
  //     }
  //     // Check that data is returned and shortcut exists
  //     else if (data && Object.keys(data).length)
  //     {
  //       processAutoTextExpansion(shortcut, data[shortcutKey], lastChar, textInput);
  //     }
  //
  //     // No expansion for the shortcut, see if case is different
  //     else if (shortcutKeyLowercase != shortcutKey)
  //     {
  //       // Check to see if there is a result lowercase version,
  //       //  and if yes, then do auto-capitalization instead
  //       chrome.storage.sync.get(shortcutKeyLowercase, function (data)
  //       {
  //         // Check for errors
  //         if (chrome.runtime.lastError) {
  //           console.log(chrome.runtime.lastError);
  //         }
  //         // Check that data is returned and shortcut exists
  //         else if (data && Object.keys(data).length)
  //         {
  //           processAutoTextExpansion(shortcut,
  //             data[shortcutKeyLowercase],
  //             lastChar,
  //             textInput,
  //             (isAllCaps ? ENUM_CAPITALIZATION_ALL : ENUM_CAPITALIZATION_FIRST)
  //           );
  //         }
  //       });
  //     }
  //
  //     // If last character is whitespace, clear buffer
  //     if (WHITESPACE_REGEX.test(lastChar)) {
  //       clearTypingBuffer();
  //     }
  //   });
  // }

  // Process autotext expansion and replace text
  // function processAutoTextExpansion(shortcut, autotext, lastChar, textInput, capitalization)
  // {
  //   console.log('processAutoTextExpansion:', autotext, capitalization);
  //
  //   // Check if shortcut exists and should be triggered
  //   if (autotext && textInput)
  //   {
  //     // If shortcuts are disabled, abort early
  //     if (disableShortcuts) {
  //       return;
  //     }
  //
  //     // Update / get clipboard text
  //     getClipboardData(function()
  //     {
  //       // // Handle clipboard pastes
  //       // autotext = processClips(autotext);
  //       //
  //       // // Handle moment.js dates
  //       // autotext = processDates(autotext);
  //       //
  //       // // Handle %url% macro
  //       // autotext = processUrls(autotext);
  //
  //       // Adjust capitalization
  //       switch (capitalization)
  //       {
  //         case ENUM_CAPITALIZATION_FIRST:
  //           autotext = autotext.charAt(0).toUpperCase() + autotext.slice(1);
  //           break;
  //
  //         case ENUM_CAPITALIZATION_ALL:
  //           autotext = autotext.toUpperCase();
  //           break;
  //
  //         default: break;
  //       }
  //
  //       // Setup for processing
  //       var domain = window.location.host;
  //       console.log('textInput: ', textInput);
  //
  //       // If input or textarea field, can easily change the val
  //       if (textInput.nodeName == 'TEXTAREA' || textInput.nodeName == 'INPUT')
  //       {
  //         // Add whitespace if was last character
  //         if (WHITESPACE_REGEX.test(lastChar)) {
  //           autotext += lastChar;
  //         }
  //
  //         replaceTextRegular(shortcut, autotext, textInput);
  //       }
  //       else	// Trouble... editable divs & special cases
  //       {
  //         // Add whitespace if was last character
  //         if (lastChar == ' ') {
  //           autotext += '&nbsp;';
  //         } else if (lastChar == '\t') {
  //           autoText += '&#9;';
  //         }
  //
  //         console.log('Domain:', domain);
  //         replaceTextContentEditable(shortcut, autotext, findFocusedNode());
  //       }
  //
  //       // Always clear the buffer after a shortcut fires
  //       clearTypingBuffer();
  //     });	// END - getClipboardData()
  //   }	// END - if (autotext)
  //   else {  // Error
  //     console.log('Invalid input, missing autotext or textinput parameters.');
  //   }
  // }

  // Specific handler for regular textarea and input elements
  function replaceTextRegular(shortcut, autotext, textInput)
  {
    var cursorPosition = getCursorPosition(textInput);

    var newText = replaceText(
      textInput.value,
      shortcut,
      autotext,
      cursorPosition
    );
    console.log(newText);
    textInput.value = newText;
    setCursorPosition(textInput, cursorPosition - shortcut.length + autotext.length);
  }

  // Reusable handler for editable iframe text replacements
  function replaceTextContentEditable(shortcut, autotext, node, win)
  {
    // Find focused div instead of what's receiving events
    var textInput = node.parentNode;
    console.log(textInput);

    // Get and process text, update cursor position
    var cursorPosition = getCursorPosition(textInput, win)
      , text = replaceHTML(node.textContent, shortcut, autotext, cursorPosition)
      , multiline = false
      , lines
    ;

    // If autotext is multiline text, split by newlines, join with <br> tag instead
    if (autotext.indexOf('\n') >= 0)
    {
      lines = text.split('\n');
      text = lines.join('<br>');
      multiline = true;
    }

    // A way to insert HTML into a content editable div with raw JS.
    //  Creates an element with the HTML content, then transfers node by node
    //  to a new Document Fragment that replaces old node
    //  Source from: http://stackoverflow.com/questions/6690752/insert-html-at-caret-in-a-contenteditable-div
    var el = document.createElement('div')          // Used to store HTML
      , frag = document.createDocumentFragment()  // To replace old node
      , cursorNode;                               // To track cursor position
    el.innerHTML = text;                            // Set HTML to div, then move to frag
    for (var tempNode; tempNode = el.firstChild; frag.appendChild(tempNode))
    {
      console.log(tempNode.nodeType, tempNode);
      if (tempNode.nodeType === Node.COMMENT_NODE
        && tempNode.nodeValue == CURSOR_TRACKING_TAG) {
        cursorNode = tempNode;
      }
    }
    textInput.replaceChild(frag, node);             // Replace old node with frag

    // Set cursor position based off tracking node (or last child if we
    //  weren't able to find the cursor tracker), then remove tracking node
    setCursorPositionAfterNode(cursorNode || textInput.lastChild, win);
    if (cursorNode) {
      cursorNode.parentNode.removeChild(cursorNode);
    }
  }

  // Replacing shortcut with autotext in text at cursorPosition
  function replaceText(text, shortcut, autotext, cursorPosition)
  {
    console.log('cursorPosition:', cursorPosition);
    console.log('currentText:', text);
    console.log('shortcut:', shortcut);
    console.log('expandedText:', autotext);

    // Replace shortcut based off cursorPosition
    return [text.slice(0, cursorPosition - shortcut.length),
      autotext, text.slice(cursorPosition)].join('');
  }

  // Replacing shortcut with autotext HTML content at cursorPosition
  function replaceHTML(text, shortcut, autotext, cursorPosition)
  {
    console.log('cursorPosition:', cursorPosition);
    console.log('currentText:', text);
    console.log('shortcut:', shortcut);
    console.log('expandedText:', autotext);

    // If autotext expansion already has cursor tag in it, don't insert
    var cursorTag = (autotext.indexOf(CURSOR_TRACKING_HTML) >= 0)
      ? '' : CURSOR_TRACKING_HTML;

    // Replace shortcut based off cursorPosition,
    //  insert tracking tag for cursor if it isn't already defined in autotext
    return [text.slice(0, cursorPosition - shortcut.length),
      autotext, cursorTag, text.slice(cursorPosition)].join('');
  }

    // Find node that has text contents that matches text
  function findMatchingTextNode(div, text)
  {
    return $(div).contents().filter(function() {
      return (this.nodeType == Node.TEXT_NODE)	    // Return all text nodes
        && (this.nodeValue.length == text.length);	// with same text length
    }).filter(function() {
      return (this.nodeValue == text);	// Filter for same text
    }).first().get(0);
  }

  // Find node that user is editing right now, for editable divs
  //  Optional passed window to perform selection find on
  function findFocusedNode(win)
  {
    // Use default window if not given window to search in
    if (!win) {
      win = window;
    }

    // Look for selection
    if (win.getSelection) {
      var selection = win.getSelection();
      if (selection.rangeCount) {
        return selection.getRangeAt(0).startContainer;
      }
    }
    return null;
  }

  // Returns the first match for a parent matching the given tag and classes.
  //  Tag parameter should be a string, el is the element to query on, and
  //  classes should be an array of strings of the names of the classes.
  function hasParentSelector(el, tag, classes)
  {
    tag = tag.toUpperCase();
    var found = false;
    while (el.parentNode && !found)
    {
      el = el.parentNode;     // Check parent
      if (el && el.tagName == tag) {
        for (var i = 0; i < classes.length; i++)
        {
          if (!el.classList.contains(classes[i])) {
            break;
          }
          found = true;   // Found = true if element has all classes
          break;          // Break to while loop
        }
      }
    }
    return el;
  }

  // Get selected text
  // Source: https://stackoverflow.com/questions/5379120/get-the-highlighted-selected-text
  function getSelectionText() {
      var text = "";
      if (window.getSelection) {
          text = window.getSelection().toString();
      } else if (document.selection && document.selection.type != "Control") {
          text = document.selection.createRange().text;
      }
      return text;
  }

  // Extract urls from html href
  function extractHrefURLs(html) {
    var regex = /(?:href="|')(.*?)(?:"|')/gi;
    return regex.exec(html);
  }

  // Check if text is url
  function isURL(text) {
    if (text) {
      return text.match(/[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
    }
    return false;
  }

  // Get selected html
  // Source: https://stackoverflow.com/questions/5083682/get-selected-html-in-browser-via-javascript
  function getSelectionHTML() {
    var range, data = {};
    if (document.selection && document.selection.createRange) {
      console.log('doc');
      range = document.selection.createRange();
      data.html = range.htmlText;
      data.text = range.toString();
      data.urls = extractHrefURLs(data.html);
    }
    else if (window.getSelection) {
      console.log('win');
      var selection = window.getSelection();
      if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
        var clonedSelection = range.cloneContents();
        var div = document.createElement('div');
        div.appendChild(clonedSelection);
        data.html = div.innerHTML;
        data.text = div.textContent;
        data.urls = extractHrefURLs(data.html);
      }
    }
    // Check if actual text is url
    if (!data.urls) {
      data.urls = [];
    }
    if (isURL(data.text)) {
      data.urls.push(data.text);
    }
    console.log('selectionhtml:', data);
    return data;
  }

  // Cross-browser solution for getting cursor position
  function getCursorPosition(el, win, doc)
  {
    var pos = 0, sel;
    if (!win) {
      win = window;
    }
    if (!doc) {
      doc = document;
    }
    if (el.nodeName == 'INPUT' || el.nodeName == 'TEXTAREA')
    {
      try { 	// Needed for new input[type=email] failing
        pos = el.selectionStart;
      } catch (exception) {
        console.log('getCursorPosition:', exception);
      }
    }
    else	// Other elements
    {
      sel = win.getSelection();
      if (sel.rangeCount) {
        pos = sel.getRangeAt(0).endOffset;
      }
    }
    return pos;
  }


  // Cross-browser solution for setting cursor position
  function setCursorPosition(el, pos)
  {
    console.log('setCursorPosition:', pos);
    var sel, range;
    if (el.nodeName == 'INPUT' || el.nodeName == 'TEXTAREA') {
      try {	// Needed for new input[type=email] failing
        if (el.setSelectionRange) {
          el.setSelectionRange(pos, pos);
        } else if (el.createTextRange) {
          range = el.createTextRange();
          range.collapse(true);
          range.moveEnd('character', pos);
          range.moveStart('character', pos);
          range.select();
        }
      } catch (exception) {
        console.log('setCursorPosition', exception);
      }
    } else {	// Other elements
      var node = el.childNodes[0];	// Need to get text node
      if (window.getSelection && document.createRange) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true);
        range.setEnd(node, pos);
        range.setStart(node, pos);
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } else if (document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(el);
        range.collapse(true);
        range.setEnd(node, pos);
        range.setStart(node, pos);
        range.select();
      }
    }
  }

  // Sets cursor position after a specific node, and optional
  //  parameter to set what the window/document should be
  function setCursorPositionAfterNode(node, win, doc)
  {
    console.log('setCursorPositionAfterNode:', node);

    // Setup variables
    var sel, range;
    if (!win) {
      win = window;
    }
    if (!doc) {
      doc = document;
    }

    // Check for getSelection(), if not available, try createTextRange
    if (win.getSelection && doc.createRange)
    {
      range = doc.createRange();
      range.setStartAfter(node);
      range.collapse(true);
      sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    else if (doc.body.createTextRange)
    {
      range = doc.body.createTextRange();
      range.setStartAfter(node);
      range.collapse(true);
      range.select();
    }
  }

  // Sets cursor position for a specific node, and optional
  //  parameter to set what the window/document should be
  function setCursorPositionInNode(node, pos, win, doc)
  {
    console.log('setCursorPositionInNode:', pos);

    // Setup variables
    var sel, range;
    if (!win) {
      win = window;
    }
    if (!doc) {
      doc = document;
    }

    // Check for getSelection(), if not available, try createTextRange
    if (win.getSelection && doc.createRange)
    {
      range = doc.createRange();
      range.setEnd(node, pos);
      range.setStart(node, pos);
      sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    else if (doc.body.createTextRange)
    {
      range = doc.body.createTextRange();
      range.setEnd(node, pos);
      range.setStart(node, pos);
      range.select();
    }
  }

  // Remove classes that start with a prefix
  //  param: $target should be a jQuery object
  function removeClassesStartingWith($target, prefix) {
    $target.removeClass(function (index, className) {
      return (className.match(new RegExp('/(^|\s)' + prefix + '\S+/g')) || []).join(' ');
    });
  }

  // // Process and replace %url% tags with content from current url
  // function processUrls(text)
  // {
  //   var url = window.location.href;
  //   return text.replace(URL_MACRO_REGEX, url);
  // }
  //
  // // Process and replace clip tags with content from clipboard
  // function processClips(text)
  // {
  //   console.log('processClips', text);
  //
  //   // Find all indices of opening tags
  //   var clipTags = [];
  //   while (result = CLIP_MACRO_REGEX.exec(text)) {
  //     clipTags.push(result.index);
  //   }
  //
  //   // Only continue if we have any tags
  //   if (!clipTags.length) {
  //     return text;
  //   }
  //   console.log('clipTags:', clipTags);
  //
  //   // Loop through and replace clip tags with clipboard pasted text
  //   var processedText = [text.slice(0, clipTags[0])];
  //   console.log(processedText);
  //   for (var i = 0, len = clipTags.length; i < len; ++i)
  //   {
  //     processedText.push(clipboard);
  //     console.log('pre', processedText);
  //     processedText.push(text.slice(clipTags[i] + 6,	// 6 for '%clip%'
  //       (i == len - 1) ? undefined : clipTags[i+1]));
  //     console.log('post', processedText);
  //   }
  //
  //   // Return processed dates
  //   return processedText.join('');
  // }

  // Get page title for url
  function getPageTitleForURL(url, completionBlock) {
    chrome.runtime.sendMessage({
      request:'getPageTitle',
      url: url,
    }, function(data) {
      console.log('getPageTitle:', data);
      if (completionBlock) {
        completionBlock(data);
      }
    });
  }

  // Get recent history
  function getRecentHistory(completionBlock) {
    chrome.runtime.sendMessage({
      request:'getRecentHistory'
    }, function(data) {
      console.log('getRecentHistory:', data);
      history = data;
      if (completionBlock) {
        completionBlock();
      }
    });
  }

  // Get recent bookmarks
  function getRecentBookmarks(completionBlock) {
    chrome.runtime.sendMessage({
      request:'getRecentBookmarks'
    }, function(data) {
      console.log('getRecentBookmarks:', data);
      bookmarks = data;
      if (completionBlock) {
        completionBlock();
      }
    });
  }

  // Get what's stored in the clipboard
  function getClipboardData(completionBlock) {
    chrome.runtime.sendMessage({
      request:'getClipboardData'
    }, function(data) {
      console.log('getClipboardData:', data);
      clipboard = data.paste;
      if (completionBlock) {
        completionBlock();
      }
    });
  }

  // Attach listener to keypresses
  function addListeners(elementSelector) {
    console.log('addListeners:', elementSelector);

    // Add default listeners to element
    var $target = $(elementSelector);
    $target.on(EVENT_NAME_KEYPRESS, keyPressHandler);
    $target.on(EVENT_NAME_KEYUP, keyUpHandler);
    $target.on(EVENT_NAME_BLUR, clearTypingBuffer);
    $target.on(EVENT_NAME_CLICK, clearTypingBuffer);
    $target.on(EVENT_NAME_PASTE, pasteHandler);
  }

  // Detach listener for keypresses
  function removeListeners(elementSelector)
  {
    var $target = $(elementSelector);
    $target.off(EVENT_NAME_KEYPRESS);
    $target.off(EVENT_NAME_KEYUP);
    $target.off(EVENT_NAME_LOAD);
    $target.off(EVENT_NAME_BLUR);
  }

  // Attach listener for spotlight shortcut
  function addSpotlightListener() {
    console.log('addSpotlightListener()');
    $(document).on(EVENT_NAME_KEYDOWN, null, SPOTLIGHT_SHORTCUT, activateSpotlight);
    $(document).on(EVENT_NAME_KEYDOWN, '*', SPOTLIGHT_SHORTCUT, activateSpotlight);
    $(document).on(EVENT_NAME_KEYDOWN, SPOTLIGHT_INPUT, SPOTLIGHT_SHORTCUT, activateSpotlight);
  }

  // Detach listener for spotlight shortcut
  function removeSpotlightListener() {
    $(document).off(EVENT_NAME_KEYDOWN);
  }

  // Attach listener for copy
  function addCopyListener() {
    $(document).on(EVENT_NAME_COPY, function(event) {
      console.log('copied');
      copyEvent = event;
    });
  }

  // Create and show a warning message crouton that can be dismissed or autohide
  function showCrouton(message, autohide)
  {
    // Create and style crouton
    var crouton = document.createElement('div');
    crouton.style['width'] = 'auto';
    crouton.style['position'] = 'fixed';
    crouton.style['bottom'] = '24px';
    crouton.style['left'] = '24px';
    crouton.style['padding'] = '16px';
    crouton.style['text-align'] = 'center';
    crouton.style['font'] = 'bold 16px/16px Helvetica';
    crouton.style['color'] = '#fff';
    crouton.style['background-color'] = '#222';
    crouton.style['opacity'] = '.8';
    crouton.style['border-radius'] = '4px';

    // Add to body, add content
    var $crouton = $(crouton);
    $crouton.text(message).hide().appendTo('body').fadeIn(ANIMATION_FAST);

    if (autohide) {
      setTimeout(function() {
        $crouton.fadeOut(ANIMATION_FAST, function() {
          $crouton.remove();
        });
      }, TIME_SHOW_CROUTON);
    }
    else    // Show a close button
    {
      // Create and style close button
      var button = document.createElement('button');
      button.style['font'] = 'bold 13px/13px Verdana';
      button.style['margin'] = '0 6px';
      button.style['padding'] = '4px';
      button.style['float'] = 'right';

      // Add to body, add content, and actions
      $crouton.append($(button)
        .text('x')
        .click(function(e) {
          $(this).parent().remove();
        })
      );
    }
  }

  // Get XSRF token for access to engage
  function getXsrfToken() {
    console.log('getXsrfToken');
    $.get(URL_XSRF_TOKEN).always(
      function(data, status, jqXHR) {
        var response = JSON.parse(data.responseText.slice(6));
        console.log('response:', response);
      }
    );
  }

  // Document ready function
  $(function() {
    addSpotlightListener();         // Add listener for keyboard shortcut
    getRecentBookmarks();
    addCopyListener();
    getXsrfToken();
	});

})(jQuery);
