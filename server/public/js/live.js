/*global io */

var padZero = function(num) {
      return num < 10 ? "0" + num : num;
    },

    formatTime = function(milliseconds) {
      var seconds = Math.floor(milliseconds / 1000),
          hours   = Math.floor(seconds / 3600),
          minutes = Math.floor((seconds / 60) % 60);
      return padZero(hours % 24) + ':' + padZero(minutes) + ':' + padZero(seconds % 60);
    },

    formattedTimeRegex = /^(\d{2}):(\d{2}):(\d{2})$/,

    isFormattedTime = function(timeStr) {
      return formattedTimeRegex.test(timeStr);
    },

    formattedTimeToMilliseconds = function(timeStr) {
      var matches = timeStr.match(formattedTimeRegex);
      return 1000 * (parseInt(matches[1]) * 3600 +
                     parseInt(matches[2]) * 60 +
                     parseInt(matches[3]));
    },

    socket = io.connect('http://localhost:63685');


$(function() {

  var $body = $('body'),
      slug;


  /* LIVE SHOWNOTES
   * -----------------------------------------------------------------------------
   */

  if ($body.hasClass('page-live')) {

    // vars
    // -----------------------------------------------------------------------------

    var tzOffset  = new Date().getTimezoneOffset() * 60000, // Different between UTC and local time
        $autoOpen = $('#auto-open'),
        $result   = $('#result');


    // socket bindings
    // -----------------------------------------------------------------------------

    socket.on('connect', function () {
      socket.emit('connectedLiveShownotes', $('body').data('publicSlug'));
    });


    socket.on('push', function(data) {
      if ($autoOpen.is(':checked') && !data.isText)
        window.open(data.url, '_blank');
      
      var markup = '<span class="time">' + formatTime(data.time - tzOffset) + '</span>';
      if (data.isText)
        markup += data.title;
      else
        markup += '<a href="' + data.url + '" target="_blank">' + data.title + '</a>';

      $result.prepend('<li id="entry-' + data.id + '">' + markup + '</li>');
      $body.removeClass('on-empty');
    });


    socket.on('counter', function(data) {
      $('#counter').html(data);
    });


    socket.on('titleUpdatedSuccess', function(data) {
      $('#title').text(data.title);
    });


    socket.on('linkDeleted', function(data) {
      $('#entry-' + data.id).remove();
      $body.toggleClass('on-empty', $result.find('li').length < 1);
    });


    // init
    // -----------------------------------------------------------------------------

    // format time from timestamp
    $('.time').each(function() {
      var $this = $(this);
      $this.text(formatTime(parseInt($this.data('time')) - tzOffset));
    });

    // apply saved settings for auto opening links
    if (!!localStorage) {
      $autoOpen
        .prop('checked', localStorage.autoOpen == 'true')
        .on('change', function() {
          localStorage.autoOpen = $(this).prop('checked');
        });
    }

    // request slug for edit/remove icons next to the links
    if (typeof window.postMessage == 'function') {
      
      window.postMessage({
        type:       'showmatorRequestSlugFromPage',
        publicSlug: window.location.href.split('/')[4]
      }, '*');
      
      window.addEventListener('message', function(event) {
        if (event.source == window && event.data &&
              event.data.type == 'showmatorResponseSlugFromScript' &&
              event.data.slug) {
          
          slug = event.data.slug;

          $result.on('click', '.btn-edit, .btn-delete', function(e) {
            e.preventDefault();
            var $this = $(this);

            // edit/save
            if ($this.hasClass('btn-edit')) {
              var $icon = $this.find('.glyphicon'),
                  $link = $this.parent().prev(),
                  saveOnEnter = function(e) {
                    if (e.keyCode == 13) {
                      e.preventDefault();
                      $this.click();
                    }
                  };

              // save
              if ($icon.hasClass('glyphicon-ok')) {
                var text = $link.prop('contenteditable', false).off('keydown.saveOnEnter').blur().text();
                console.log("I'm saving");
                // TODO update Title via Socket

              // edit
              } else {
                $link.prop('contenteditable', true).focus().on('keydown.saveOnEnter', saveOnEnter);
              }

              // switch icons (pencil/ok), btn class (default/primary) and
              // show/hide delete btn
              $this.parent().toggleClass('editing');
              $icon.toggleClass('glyphicon-pencil glyphicon-ok');
              $this.toggleClass('btn-default btn-primary');

            // delete
            } else {
              // TODO text via data-attribute?
              if (confirm('Wirklich löschen?')) {
                console.log("I'm deleting");
                // TODO löschen event
                // TODO Item löschen
              }
            }
            // TODO if btn-edit: Modal mit update initieren
            // TODO if btn-delete: socket-delete
          }).find('a').after(event.data.html);
        }
      }, false);
    }



  /* HTML EXPORT
   * -----------------------------------------------------------------------------
   */

  } else {

    // vars and funcs
    // -----------------------------------------------------------------------------

    var $markup = $('#markup-container'),
        start   = $markup.find('.time').data('time'),
        offset  = $markup.data('offset'),


        // format time from timestamp
        fillTimes = function() {
          $markup.find('li')/*.removeClass('hide')*/.find('.time').each(function() {
            var $this = $(this),
                time  = parseInt($this.data('time')) - start + offset;

            // mark entries which were added too early
            // if (time < 0)
            //   $this.closest('li').addClass('hide');
            // else
              $this.text(formatTime(time));
          });
        },


        // generate sourcecode in textfield  
        updateHtml = function() {
          var showList     = $('#as-ul').is(':checked'),
              showTimes    = $('#show-times').is(':checked'),
              openInNewTab = $('#open-in-new-tab').is(':checked'),
              $newMarkup   = $markup.clone();

          // remove entries which were added too early
          // $newMarkup.find('.hide').remove();
          
          var html = $newMarkup.html()
               .replace(/ data-time="\d+"/g, '') // strip data-attributes
               .replace(/\n +/g, '\n')           // strip unnecessary spaces
               .replace(/\n+/g, '\n')            // multiple linebreaks to one
               .replace(/(^\n|\n$)/g, '');       // strip linebreaks at start/end

          if (showList) {
            // indent lines
            html = html
              .replace(/<(\/?)li( class="")?/g, '  <$1li')
              .replace(/<(a|span)/g, '    <$1');
          } else {
            // hide ul/li-tags, insert br-tag
            html = html
              .replace(/<\/li>/g, '<br>')
              .replace(/<\/?(ul|li)( class="")?>\n?/g, '');
          }

          // hide span-tags
          if (!showTimes)
            html = html.replace(/ *<span[^\/]+<\/span>\n/g, '');

          // hide target-attributes
          if (!openInNewTab)
            html = html.replace(/ target="_blank"/g, '');

          $newMarkup.remove();

          $('#sourcecode').val(html);


          localStorage.showList     = showList ? 1 : 0;
          localStorage.showTimes    = showTimes ? 1 : 0;
          localStorage.openInNewTab = openInNewTab ? 1 : 0;
        };


    // event bindings
    // -----------------------------------------------------------------------------

    // bind change events for updating sourcecode
    $('#as-ul, #show-times, #open-in-new-tab').change(updateHtml);

    // save new offset and recalculate times
    $('#offset').val(formatTime(offset)).keyup(function() {
      // TODO validate + error class
      var $this = $(this),
          val   = $.trim($this.val());
      if (!isFormattedTime(val))
        $this.addClass('error');
      else {
        $this.removeClass('error');
        var newOffset = formattedTimeToMilliseconds(val);
        if (newOffset != offset) {
          offset = newOffset;
          socket.emit('offsetUpdated', {slug: slug, offset: offset});
          fillTimes();
          updateHtml();
        }
      }
    });

    // select all text when focussing textarea
    $('#sourcecode').one('focus', function() {
      $(this).select().one('mouseup', function(e) {
        e.preventDefault();
      });
    });


    // socket bindings
    // -----------------------------------------------------------------------------

    // TODO
    // socket.on('push', function(data) {
    // });

    // update title if changed
    socket.on('connect', function () {
      socket.emit('connectedHtmlExport', slug);
    });
    socket.on('titleUpdatedSuccess', function(data) {
      $('#title').text(data.title);
    });

    // TODO
    // socket.on('linkDeleted', function(data) {
    //   $('#entry-' + data.id).remove();
    //   $body.toggleClass('on-empty', markup.find('li').length > 0);
    // });


    // init
    // -----------------------------------------------------------------------------

    slug = $markup.data('slug');

    // load checkbox states from localStorage
    $('#as-ul').prop('checked', parseInt(localStorage.showList) === 1);
    $('#show-times').prop('checked', parseInt(localStorage.showTimes) === 1);
    $('#open-in-new-tab').prop('checked', parseInt(localStorage.openInNewTab) === 1);

    // intially load html
    fillTimes();
    updateHtml();

  } // end if not live shownotes
});
