// Worker script code
self.addEventListener('message', function (e) {
    const data = e.data;
    // Processing data...
    self.postMessage(data.processed);
});