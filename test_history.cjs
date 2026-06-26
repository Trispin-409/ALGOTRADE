const http = require('http');
http.get('http://localhost:3000/api/account/a7a66503-6e94-4a46-a83e-a132717b248f/history', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
});
