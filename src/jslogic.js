/* AVWX - jslogic.js
 * Michael duPont
 * Creates and organizes TAF reports into Pebble Timeline pins
 * Ties into avwx.rest, my public aviation weather service
*/

//--------GeoLocation Var
var getNearest = localStorage.getItem('getNearest'); //Ignore stationID and fetch data for nearest
if (getNearest === 'true') {
  getNearest = true;
} else {
  getNearest = false;
}

//--------Station Var
var stationID = localStorage.getItem('stationID'); //The station to fetch data for
if ((stationID === null)||(stationID.length != 4)) { stationID = ''; }

//--------Timeline ID Vars
var lastIDRoot = localStorage.getItem('lastIDRoot'); //Ex: AVWX-TAF-KJFK-123456Z-
var lastIDNum = localStorage.getItem('lastIDNum');   //The number of pins inserted last time
if (lastIDNum === null) {
  lastIDNum = -1; //Will skip pin deletion
} else {
  lastIDNum = parseInt(lastIDNum);
}

//--------Global/Shared Vars
var avwxResp;         //Dictionary of TAF data from AVWX
var pinList;          //List of timeline pins to be inserted
var currentDeleteNum; //The iteration value when deleting pins recursively
var currentInsertNum; //The iteration value when inserting pins recursively

/******************************* timeline lib *********************************/

//Timeline insert and delete functions from SDK examples

// The timeline public URL root
var API_URL_ROOT = 'https://timeline-api.getpebble.com/';

/**
 * a request to the Pebble public web timeline API.
 * @param pin The JSON pin to insert. Must contain 'id' field.
 * @param type The type of request, either PUT or DELETE.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function timelineRequest(pin, type, callback) {
  // User or shared?
  var url = API_URL_ROOT + 'v1/user/pins/' + pin.id;
  console.log('API URL: ' + url);

  // Create XHR
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    console.log('timeline: response received: ' + this.responseText);
    callback(this.responseText);
  };
  xhr.open(type, url, false);

  // Get token
  Pebble.getTimelineToken(function(token) {
    // Add headers
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', '' + token);

    // Send
    xhr.send(JSON.stringify(pin));
    console.log('timeline: request sent: '+type);
  }, function(error) { console.log('timeline: error getting timeline token: ' + error); });
}

/**
 * Insert a pin into the timeline for this user.
 * @param pin The JSON pin to insert.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function insertUserPin(pin, callback) {
  timelineRequest(pin, 'PUT', callback);
}

/**
 * Delete a pin from the timeline for this user.
 * @param pin The JSON pin to delete.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function deleteUserPin(pin, callback) {
  timelineRequest(pin, 'DELETE', callback);
}

/************************* Pin formatting functions ***************************/

//Sets a Date object that is used to help create a pin's datetime
//setIssueDate must be called before createDateTime
//@param issue The issue time of the report
var issueDate;
function setIssueDate(issue) {
  issueDate = new Date();
  var day = parseInt(issue.substring(0,2));
  while (issueDate.getUTCDate() > day) { issueDate.setUTCDate(issueDate.getUTCDate()-1); }
  var hour = parseInt(issue.substring(2,4));
  issueDate.setUTCHours(hour);
  console.log('Issue String: ' + issue);
  console.log('Issue DateTm: ' + issueDate.toString());
}

//Returns a Date object from a forecast's start time
//Can only be called after setIssueDate
//@param time The start time of a forecast
function createDateTime(time) {
  var date = new Date(issueDate);
  var day = parseInt(time.substring(0,2));
  while (date.getUTCDate() < day) { date.setUTCDate(date.getUTCDate()+1); }
  var hour = parseInt(time.substring(2,4));
  date.setUTCHours(hour);
  date.setUTCMinutes(0);
  date.setUTCSeconds(0);
  date.setUTCMilliseconds(0);
  //console.log('Time String: ' + time);
  console.log('Time DateTm: ' + date.toString());
  return date;
}

//Creates the 'body' string from the elements of a forecast's dictionary
//@param wxDict The forecast dictionary
function formatBodyString(wxDict) {
  //console.log(JSON.stringify(wxDict));
  var ret = wxDict['Raw-Line'];
  if (wxDict.Probability !== '') { ret = ret.substring(ret.indexOf(' ')+1); }
  //console.log(ret);
  ret = ret.substring(ret.indexOf(' ')+1);
  //console.log(ret);
  ret = wxDict['Start-Time'] + '/' + wxDict['End-Time'] + ' ' + ret;
  //console.log(wxDict.Type);
  if (['TEMPO','BECMG','INTER'].indexOf(wxDict.Type) >= 0) {
    //console.log('Found special');
    ret = ret.substring(ret.indexOf(' ')+1);
    if (wxDict.Type == 'TEMPO') { ret = 'TEMPO ' + ret; }
  }
  //console.log(ret);
  return ret;
}

/*function getDuration(startDT , endDT) {
  var diffMS = endDT - startDT;
  console.log(diffMS.toString());
  var minutes = diffMS / 60000;
  console.log('Duration = ' + minutes.toString());
  return minutes;
}*/

//Dictionary of Flight Rules with their corresponding background color and timeline icon
var frUIElements = {
  'VFR': ['#55AA55','system://images/TIMELINE_SUN'],
  'MVFR': ['#55AAFF','system://images/PARTLY_CLOUDY'],
  'IFR': ['#AA5555','system://images/CLOUDY_DAY'],
  'LIFR': ['#AA55FF','system://images/RAINING_AND_SNOWING']
};

//Create a timeline pin for a forecast
//@param wxDict The forecast dictionary
//@param pinID The id to be assigned to the pin
//@param station The reporting station
function createPin(wxDict, pinID, station) {
  var startDT = createDateTime(wxDict['Start-Time']);
  var pin = {
    'id': pinID,
    'time': startDT,
    //'duration': getDuration(startDT , createDateTime(wxDict['End-Time'])),
    'layout': {
      //'type': 'calendarPin',
      'type': 'genericPin',
      'title': 'TAF-'+station,
      'subtitle': 'Forecast: '+wxDict['Flight-Rules'],
      'body': formatBodyString(wxDict),
      'foregroundColor': '#FFFFFF',
      'backgroundColor': frUIElements[wxDict['Flight-Rules']][0],
      'tinyIcon': frUIElements[wxDict['Flight-Rules']][1]
    }
  };
  console.log('New Pin: ' + JSON.stringify(pin));
  return pin;
}

//Adds a timeline notification to a given pin
//@param pin The timeline pin
//@param station The reporting station
//@param issued The time to report was issued
function addNotification(pin, station, issued) {
  console.log('Add notification');
  var notif = {
    'layout': {
      'type': 'genericNotification',
      'title': 'TAF Updated',
      'body': 'Issued for '+station+' @ '+issued,
      'tinyIcon': 'system://images/SCHEDULED_FLIGHT'
    }
  };
  pin.createNotification = notif;
  return pin;
}

/*************************** Control flow functions *****************************/

/*
  The control flow is broken up as it is because deleteing and inserting pins must
  be done recursively to preserve JavaScript's single-threaded execution.
*/

//Begins the avwx response handling
function handleRequest(resp) {
  console.log('##### Begin Main Handling #####');
  if ('Error' in resp) { exitApp('Error Fetch'); }
  else if (resp.Time === '') { exitApp('Error Time'); }
  else {
    avwxResp = resp;
    /* Delete old Pins */
    currentDeleteNum = 0;
    deleteOldPins();
  }
}

//Recursively delete old pins from the timeline
//currentDeleteNum must be set before calling
//Recursion ends and moves on to buildNewPins
function deleteOldPins() {
  console.log('Delete Func: ' + currentDeleteNum.toString() + ' ' + lastIDNum.toString());
  if (currentDeleteNum > lastIDNum) {
    buildNewPins();
  } else {
    var pinID = lastIDRoot+currentDeleteNum.toString();
    currentDeleteNum++;
    console.log('Remove Pin: ' + pinID);
    //Set to false to not call timeline API during testing
    if (true) { deleteUserPin({'id':pinID}, deleteOldPins); }
    else { deleteOldPins(); }
  }
}

//Creates pinIDRoot, builds pinList, and saves lastID values
//Calls insertNewPins when finished
function buildNewPins() {
  /* Build new Pins */
  pinList = [];
  var pinID = 'AVWX-TAF-'+avwxResp.Station+'-'+avwxResp.Time+'-';
  setIssueDate(avwxResp.Time);
  for (var i=0; i<avwxResp.Forecast.length; i++) {
    if (avwxResp.Forecast[i]['Start-Time'] !== '') { pinList.push(createPin(avwxResp.Forecast[i], pinID+i.toString(), avwxResp.Station)); }
  }
  pinList[0] = addNotification(pinList[0], avwxResp.Station, avwxResp.Time);
  localStorage.setItem('lastIDRoot', pinID);
  localStorage.setItem('lastIDNum', (i-1).toString());
  /* Send new Pins */
  currentInsertNum = pinList.length;
  insertNewPins();
}

//Recursively insert new pins from the timeline
//pinList and currentInsertNum must be set before calling
//Recursion ends and exits app
function insertNewPins() {
  console.log('Insert Func: ' + currentInsertNum.toString());
  if (currentInsertNum <= 0) {
    exitApp('TAF Updated');
  } else {
    currentInsertNum--;
    var pin = pinList[currentInsertNum];
    console.log('Send Pin: ' + pin.id);
    //Set to false to not call timeline API during testing
    if (true) { insertUserPin(pin, insertNewPins); }
    else { insertNewPins(); }
  }
}

//The last function call. Formally ends the app
//@param messege String to display on Pebble
function exitApp(messege) {
  sendDictionaryToPebble({'KEY_STATUS':messege});
  console.log('##### End of handling #####');
}

/***************************** AVWX fetch functions *******************************/

//Retrieve and parse JSON object for a given url
//Calls handleRequest with fetched object
//@param url The url to fetch
var updateReport = function(url) {
  sendDictionaryToPebble({'KEY_STATUS':'Updating TAF'});
  var request = new XMLHttpRequest();
  request.onload = function() {
    console.log(request.responseText);
    var resp = JSON.parse(request.responseText);
    handleRequest(resp);
  };
  
  console.log('Now Fetching: ' + url);
  request.open('GET', url, true);
  request.send();
};

//Called when position lookup is succesful
//@param pos A Pebble position object
function locationSuccess(pos) {
  var latitude = pos.coords.latitude;
  var longitude = pos.coords.longitude;
  console.log('Latitude = ' + latitude.toString());
  console.log('Longitude = ' + longitude.toString());
  var url = 'http://avwx.rest/api/taf.php?lat=' + latitude.toString() + '&lon=' + longitude.toString() + '&format=JSON';
  console.log(url);
  updateReport(url);
}

//Called when getNearest is true
function useGeoURL() {
  navigator.geolocation.getCurrentPosition(
    locationSuccess,
    function(err) {
      console.log('Error requesting location! ' + err.toString());
      exitApp('No Location');
    },
    {timeout: 15000, maximumAge: 60000}
  );
}

/**************************** Pebble comm/listeners ******************************/

//Send a dictionary to the Pebble
function sendDictionaryToPebble(dictionary) {
  Pebble.sendAppMessage(dictionary,
    function(e) {
      console.log('Status sent to Pebble successfully!');
    },
    function(e) {
      console.log('Error sending status to Pebble!');
    }
  );
}

//Listen for when the watchface is opened
Pebble.addEventListener('ready', 
  function(e) {
    console.log('PebbleKit JS ready!');
    if (getNearest === true) {
      useGeoURL();
    } else if (stationID !== '') {
      var url = 'http://avwx.rest/api/taf.php?station=' + stationID + '&format=JSON';
      updateReport(url);
    } else {
      exitApp('Go to Settings');
    }
  }
);

//Listen for when user opens config page
Pebble.addEventListener('showConfiguration', function(e) {
  //Prevent app updating when opening settings page
  localStorage.setItem('stationID', '');
  localStorage.setItem('getNearest', 'false');
  //Show config page
  console.log('Now showing config page');
  Pebble.openURL('http://mdupont.com/Pebble-Config/pebble-tafline-setup.html');
});

//Listen for when user closes config page
Pebble.addEventListener('webviewclosed',
  function(e) {
    console.log(e.response.length);
    console.log('Configuration window returned: ' + e.response);
    if (e.response.length !== 0) {
      var options = JSON.parse(decodeURIComponent(e.response));
      console.log('Options = ' + JSON.stringify(options));
      if (options.stationID !== '') { localStorage.setItem('stationID', options.stationID); }
      localStorage.setItem('getNearest', options.getNearest);
    }
  }
);