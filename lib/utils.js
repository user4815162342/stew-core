 var Q = require('q');

 var promiseForEach = module.exports.promiseForEach = function(array,task) {
     // inspired by http://stackoverflow.com/a/17238793/300213
     var q = Q.defer();
     var i = 0;
     function loop() {
         if (i >= array.length) {
              return q.resolve();
         }
         Q.fcall(task,array[i],i).then(loop,q.reject);
         i += 1;
     }
     // put the loop in the next tick to avoid a synchronous surprise.
     Q.nextTick(loop);
     return q.promise;
 }

 var pad = function(num) {
    norm = Math.abs(Math.floor(num));
    return (norm < 10 ? '0' : '') + norm;
 }

var timestamp = module.exports.timestamp = function() {
    // from http://stackoverflow.com/a/17415677/300213
    // with modifications to get something that looks like this:
    //`backup-2006-08-23-19-33-44.456+0000.rtf` (since colons are not good names,
    // and I want milliseconds).
    var local = new Date();
    var tzo = -local.getTimezoneOffset();
    var sign = tzo >= 0 ? '+' : '-';
    return local.getFullYear() 
        + '-' + pad(local.getMonth()+1)
        + '-' + pad(local.getDate())
        + '-' + pad(local.getHours())
        + '-' + pad(local.getMinutes()) 
        + '-' + pad(local.getSeconds()) 
        + '.' + String( (local.getMilliseconds()/1000).toFixed(3) ).slice( 2, 5 )
        + sign + pad(tzo / 60) 
        + ':' + pad(tzo % 60);
}

 var NumberToRoman = module.exports.NumberToRoman = function(num,lowercase) {
     // from http://blog.stevenlevithan.com/archives/javascript-roman-numeral-converter
    if (!+num)
        return false;
    var digits = String(+num).split("");
    var key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
               "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
               "","I","II","III","IV","V","VI","VII","VIII","IX"];
    var roman = "";
    var i = 3;
    while (i--)
        roman = (key[+digits.pop() + (i * 10)] || "") + roman;
    var result = Array(+digits.join("") + 1).join("M") + roman;     
    if (lowercase) {
        result = result.toLowercase();
    }
    return result;
 }

 var NumberToLetter = module.exports.NumberToLetter = function(num,lowercase) {
    if (!+num)
        return false;
    var letters = "";
    // the value below is zero-based, so 0 => A, 25 => Z, although
    // the result we want is one-based.
    num -= 1;
    var char;
    while (num >= 0) {
        // 26 is the number of letters to work with.
        char = num % 26;
        // 65 is the charcode for 'A'.
        letters = String.fromCharCode(char + 65) + letters;
        num -= char
        num = Math.floor(num / 26) - 1;
    }
    if (lowercase) {
        letters = letters.toLowercase();
    }
    return letters;
 }

