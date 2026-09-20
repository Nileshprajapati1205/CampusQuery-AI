// ==============================
// CampusQuery AI - Chat Logic
// ==============================

// Get HTML elements
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const chatMessages = document.getElementById("chatMessages");


// ==============================
// Send Message Function
// ==============================

function sendMessage() {

    const message = userInput.value.trim();

    // Don't send empty messages
    if (message === "") {
        return;
    }


    // Create user's message
    const userMessage = document.createElement("div");

    userMessage.classList.add("message" , "user-message");

    userMessage.innerHTML = `
        <strong>You 👤</strong>
        <p>${message}</p>
    `;

    chatMessages.appendChild(userMessage);


    // Clear input
    userInput.value = "";


    // Temporary bot response
    setTimeout(() => {

        const botMessage = document.createElement("div");

        botMessage.classList.add("message", "bot-message");

        botMessage.innerHTML = `
            <strong>CampusQuery AI 🤖</strong>
            <p>
                I received your question. My AI backend will answer this
                question once we connect the frontend with the RAG system.
            </p>
        `;

        chatMessages.appendChild(botMessage);


        // Scroll to latest message
        chatMessages.scrollTop = chatMessages.scrollHeight;

    }, 500);
}


// ==============================
// Button Click
// ==============================

sendButton.addEventListener("click", sendMessage);


// ==============================
// Enter Key
// ==============================

userInput.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        sendMessage();
    }

});