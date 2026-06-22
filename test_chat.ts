import axios from 'axios';
(async () => {
  try {
    const res = await axios.post("http://localhost:3000/api/chatrade/chat", {
       message: "hey test random block 992384213", accountId: "test", email: "trispinblackops@gmail.com" 
    });
    console.log("Status:", res.status);
    console.log("Body:", res.data);
  } catch(e: any) {
    console.error("Axios failed:", e.message, e.response?.data);
  }
})();
