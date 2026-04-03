// Add this function to your existing Apps Script project.
// It fetches your Canvas iCal feed and writes assignments to an 'assignments' sheet tab.
// Set up a time trigger for syncAssignments (every 15 min).

var SHEET_ID = 'YOUR_SHEET_ID'; // reuse same sheet ID

function syncAssignments() {
  var ICAL_URL = 'https://umich.instructure.com/feeds/calendars/user_QWg4huzUeUvgRILDMViiMXV0kkeRaL0GbsueXqsd.ics';
  var resp;
  try {
    resp = UrlFetchApp.fetch(ICAL_URL, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    });
  } catch (e) {
    Logger.log('Fetch failed: ' + e);
    return;
  }

  var code = resp.getResponseCode();
  if (code !== 200) {
    Logger.log('HTTP error: ' + code);
    return;
  }

  var text = resp.getContentText();
  if (!text || text.length < 50) {
    Logger.log('Empty or invalid response');
    return;
  }

  var blocks = text.split('BEGIN:VEVENT').slice(1);
  var rows = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 0; i < blocks.length; i++) {
    try {
      var block = blocks[i];
      var sm = block.match(/SUMMARY[^:]*:(.+)/);
      // Match DTSTART with or without params, with or without time
      var dm = block.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/);
      if (!sm || !dm) continue;
      var raw = sm[1].replace(/\r/g, '').trim();
      var title = raw.replace(/\[.*?\]/g, '').replace(/\+/g, ' ').trim();
      var due = dm[1] + '-' + dm[2] + '-' + dm[3];
      var dueDate = new Date(due + 'T23:59:59');
      // Skip past assignments
      if (dueDate < today) continue;
      // Detect course
      var course = detectAssignmentCourse(raw);
      if (!course) continue;
      // Detect type
      var type = detectAssignmentType(title);
      // Skip async physics
      if (type === 'asynch' && course === 'PHYSICS 240') continue;
      rows.push([title, course, due, type]);
    } catch (e) {
      Logger.log('Error parsing event ' + i + ': ' + e);
      continue;
    }
  }

  // Sort by due date
  rows.sort(function(a, b) { return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0; });

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('assignments');
  if (!sheet) sheet = ss.insertSheet('assignments');
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([['title', 'course', 'due', 'type']]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  Logger.log('Synced ' + rows.length + ' assignments');
}

function detectAssignmentCourse(s) {
  var courses = ['PHYSICS 240', 'PHYSICS 241', 'ASIAN 325', 'CHEM 215', 'CHEM 216', 'PSYCH 111'];
  var upper = s.toUpperCase();
  for (var i = 0; i < courses.length; i++) {
    if (upper.indexOf(courses[i]) >= 0) return courses[i];
  }
  return null;
}

function detectAssignmentType(title) {
  var s = title.toLowerCase();
  if (/exam|midterm|final/.test(s)) return 'exam';
  if (/checkpoint/.test(s)) return 'checkpoint';
  if (/essay|critical term|writing|paragraph/.test(s)) return 'writing';
  if (/asynch|async/.test(s)) return 'asynch';
  return 'reading';
}
