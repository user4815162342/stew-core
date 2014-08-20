var util = require('util');

var StewError = module.exports.StewError = function(message,code) {
    Error.call(this);
    Error.captureStackTrace(this,StewError);
    this.message = message;
    this.code = code;
}
util.inherits(StewError,Error)


