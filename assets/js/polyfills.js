// Minimal polyfills for older mobile browsers (iOS/Android WebViews).
(function () {
  "use strict";

  // Promise.prototype.finally (Safari 11- / older WebViews)
  if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
    Promise.prototype.finally = function (onFinally) {
      var P = this.constructor;
      var handler = (typeof onFinally === "function") ? onFinally : function () {};
      return this.then(
        function (value) {
          return P.resolve(handler()).then(function () { return value; });
        },
        function (reason) {
          return P.resolve(handler()).then(function () { throw reason; });
        }
      );
    };
  }
})();

