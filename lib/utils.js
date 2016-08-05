 var Q = require('q');
 var cp = require('child_process');

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

var timestamp = module.exports.timestamp = function(precision,tzoff) {
    precision = precision || 7;
    // from http://stackoverflow.com/a/17415677/300213
    // with modifications to get something that looks like this:
    //`backup-2006-08-23-19-33-44.456+0000.rtf` (since colons are not good names,
    // and I want milliseconds).
    var local = new Date();
    var result = "";
    switch (precision) {
        case 7:
            result = "." + String( (local.getMilliseconds()/1000).toFixed(3) ).slice( 2, 5 );
        case 6:
            result = "-" + pad(local.getSeconds()) + result;
        case 5:
            result = "-" + pad(local.getMinutes()) + result;
        case 4:
            result = "-" + pad(local.getHours()) + result;
        case 3:
            result = "-" + pad(local.getDate()) + result;
        case 2:
            result = "-" + pad(local.getMonth() + 1) + result;
        default:
            result = local.getFullYear() + result;
    }
    if (!tzoff && (precision > 3)) {
        var tzo = -local.getTimezoneOffset();
        var sign = tzo >= 0 ? '+' : '-';
        result += (sign + pad(tzo / 60) + ':' + pad(tzo % 60))
    }
    return result;
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

 var promiseProcess = module.exports.promiseProcess = function(command,args,showCommand) {
     var q = Q.defer();
     
     if (showCommand) {
         console.log(command + ' "' + args.join('" "') + '"');
     }
     var p = cp.spawn(command, args, { stdio: "inherit" });
     p.on("error", function(error) {
         q.reject(error);
     });
     p.on("exit", function(code,signal) {
         if (code !== 0) {
             q.reject(new Error("Command exited with non-zero code: " + code));
         } else if (signal !== null) {
             q.reject(new Error("Command killed with signal: " + signal));
         } else {
             q.resolve();
         }
     });
     return q.promise;
 }
 
