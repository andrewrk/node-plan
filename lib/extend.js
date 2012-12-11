var own = {}.hasOwnProperty;
function extend(obj, src){
  for (var key in src) {
    if (own.call(src, key)) obj[key] = src[key];
  }
  return obj;
}

module.exports = extend;
