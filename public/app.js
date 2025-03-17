document.addEventListener('DOMContentLoaded', () => {
    const messageForm = document.getElementById('message-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    
    // Generate a random user ID for this session
    // Bu oturum için rastgele bir kullanıcı ID'si oluştur
    const userId = 'user_' + Math.random().toString(36).substring(2, 15);
    let threadId = null;
    
    // Track if there's a pending tool approval
    // Bekleyen bir araç onayı olup olmadığını takip et
    let pendingToolApproval = false;
    
    // Initialize thread
    // Thread'i başlat
    initializeThread();
    
    // Handle form submission
    // Form gönderimini işle
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;
        
        // If there's a pending tool approval, show a warning
        // Bekleyen bir araç onayı varsa, uyarı göster
        if (pendingToolApproval) {
            const warningDiv = document.createElement('div');
            warningDiv.classList.add('message', 'system');
            
            const warningContent = document.createElement('div');
            warningContent.classList.add('message-content');
            warningContent.textContent = 'Please respond to the pending tool approval request before sending a new message.';
            
            warningDiv.appendChild(warningContent);
            chatMessages.appendChild(warningDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Shake the tool approval UI to draw attention to it
            // Dikkat çekmek için araç onay arayüzünü salla
            const toolApprovalUI = document.querySelector('.tool-approval');
            if (toolApprovalUI) {
                toolApprovalUI.classList.add('shake');
                setTimeout(() => {
                    toolApprovalUI.classList.remove('shake');
                }, 500);
            }
            
            return;
        }
        
        // Add user message to chat
        // Kullanıcı mesajını sohbete ekle
        addMessageToChat('user', message);
        
        // Clear input
        // Girişi temizle
        userInput.value = '';
        
        // Show typing indicator
        // Yazma göstergesini göster
        showTypingIndicator();
        
        try {
            // Send message to API
            // Mesajı API'ye gönder
            const response = await sendMessage(message);
            
            // Remove typing indicator
            // Yazma göstergesini kaldır
            removeTypingIndicator();
            
            // Check if tool approval is required
            // Araç onayı gerekip gerekmediğini kontrol et
            if (response.requiresAction) {
                // Set pending tool approval flag
                // Bekleyen araç onayı bayrağını ayarla
                pendingToolApproval = true;
                
                // Show tool approval UI
                // Araç onay arayüzünü göster
                showToolApprovalUI(response.toolCalls, response.threadId, response.runId);
            } else {
                // Add assistant response to chat
                // Asistan yanıtını sohbete ekle
                addMessageToChat('assistant', response.response);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            removeTypingIndicator();
            addMessageToChat('assistant', 'Sorry, there was an error processing your request. Please try again.');
        }
    });
    
    // Initialize thread for the user
    // Kullanıcı için thread'i başlat
    async function initializeThread() {
        try {
            const response = await fetch('/api/thread', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });
            
            const data = await response.json();
            threadId = data.threadId;
            console.log('Thread initialized:', threadId);
        } catch (error) {
            console.error('Error initializing thread:', error);
            addMessageToChat('assistant', 'Sorry, there was an error initializing the chat. Please refresh the page and try again.');
        }
    }
    
    // Send message to API
    // Mesajı API'ye gönder
    async function sendMessage(message) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                message
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to send message');
        }
        
        return response.json();
    }
    
    // Add message to chat
    // Mesajı sohbete ekle
    function addMessageToChat(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.innerHTML = formatMessage(content);
        
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        // En alta kaydır
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Format message with markdown-like syntax
    // Mesajı markdown benzeri sözdizimi ile biçimlendir
    function formatMessage(message) {
        // Convert URLs to links
        // URL'leri bağlantılara dönüştür
        message = message.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Convert newlines to <br>
        // Yeni satırları <br> etiketine dönüştür
        message = message.replace(/\n/g, '<br>');
        
        return message;
    }
    
    // Show typing indicator
    // Yazma göstergesini göster
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('typing-indicator');
        typingDiv.id = 'typing-indicator';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            typingDiv.appendChild(dot);
        }
        
        const typingContainer = document.createElement('div');
        typingContainer.classList.add('message', 'assistant');
        typingContainer.appendChild(typingDiv);
        
        chatMessages.appendChild(typingContainer);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Remove typing indicator
    // Yazma göstergesini kaldır
    function removeTypingIndicator() {
        const typingIndicator = document.querySelector('.typing-indicator')?.parentNode;
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
    
    // Show tool approval UI
    // Araç onay arayüzünü göster
    function showToolApprovalUI(toolCalls, threadId, runId) {
        const toolCall = toolCalls[0]; // For simplicity, we'll just handle the first tool call
                                       // Basitlik için, sadece ilk araç çağrısını işleyeceğiz
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        // Create the approval UI
        // Onay arayüzünü oluştur
        const approvalDiv = document.createElement('div');
        approvalDiv.classList.add('message', 'assistant', 'tool-approval');
        
        const approvalContent = document.createElement('div');
        approvalContent.classList.add('message-content');
        
        // Create the approval message
        // Onay mesajını oluştur
        let approvalMessage = `<div class="tool-approval-header">
            <strong>Allow tool from "todo" (local)?</strong>
        </div>
        <div class="tool-approval-details">
            Run ${functionName} from todo
        </div>
        <div class="tool-approval-warning">
            <div class="warning-icon">⚠️</div>
            <div class="warning-text">
                Malicious MCP servers or conversation context could potentially trick Claude into 
                attempting harmful actions through your installed tools. Review each action 
                carefully before approving.
            </div>
        </div>`;
        
        // Add function details based on the function name
        // Fonksiyon adına göre fonksiyon detaylarını ekle
        switch (functionName) {
            case 'add_todo':
                approvalMessage += `<div class="tool-details">Add todo: "${functionArgs.text}"</div>`;
                break;
            case 'remove_todo':
                approvalMessage += `<div class="tool-details">Remove todo with ID: ${functionArgs.id}</div>`;
                break;
            case 'toggle_todo':
                approvalMessage += `<div class="tool-details">Toggle completion status of todo with ID: ${functionArgs.id}</div>`;
                break;
            case 'get_todos':
                approvalMessage += `<div class="tool-details">Get all todos</div>`;
                break;
        }
        
        // Add approval buttons
        // Onay düğmelerini ekle
        approvalMessage += `<div class="tool-approval-buttons">
            <button class="deny-button">Deny</button>
            <button class="allow-once-button">Allow Once</button>
            <button class="allow-chat-button">Allow for This Chat</button>
        </div>`;
        
        approvalContent.innerHTML = approvalMessage;
        approvalDiv.appendChild(approvalContent);
        chatMessages.appendChild(approvalDiv);
        
        // Scroll to bottom
        // En alta kaydır
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Add event listeners to buttons
        // Düğmelere olay dinleyicileri ekle
        const denyButton = approvalDiv.querySelector('.deny-button');
        const allowOnceButton = approvalDiv.querySelector('.allow-once-button');
        const allowChatButton = approvalDiv.querySelector('.allow-chat-button');
        
        denyButton.addEventListener('click', async () => {
            // Reset pending tool approval flag
            // Bekleyen araç onayı bayrağını sıfırla
            pendingToolApproval = false;
            
            // Remove the approval UI
            // Onay arayüzünü kaldır
            approvalDiv.remove();
            
            // Show typing indicator
            // Yazma göstergesini göster
            showTypingIndicator();
            
            try {
                // Send denial to API
                // Reddetme işlemini API'ye gönder
                const response = await fetch('/api/tool-response', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        threadId,
                        runId,
                        approved: false
                    })
                });
                
                const data = await response.json();
                
                // Remove typing indicator
                // Yazma göstergesini kaldır
                removeTypingIndicator();
                
                // Add assistant response to chat
                // Asistan yanıtını sohbete ekle
                addMessageToChat('assistant', data.response);
            } catch (error) {
                console.error('Error sending tool response:', error);
                removeTypingIndicator();
                addMessageToChat('assistant', 'Sorry, there was an error processing your request. Please try again.');
            }
        });
        
        const handleApproval = async () => {
            // Reset pending tool approval flag
            // Bekleyen araç onayı bayrağını sıfırla
            pendingToolApproval = false;
            
            // Remove the approval UI
            // Onay arayüzünü kaldır
            approvalDiv.remove();
            
            // Show typing indicator
            // Yazma göstergesini göster
            showTypingIndicator();
            
            try {
                // Send approval to API
                // Onayı API'ye gönder
                const response = await fetch('/api/tool-response', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        threadId,
                        runId,
                        approved: true,
                        toolCalls
                    })
                });
                
                const data = await response.json();
                
                // Remove typing indicator
                // Yazma göstergesini kaldır
                removeTypingIndicator();
                
                // Add assistant response to chat
                // Asistan yanıtını sohbete ekle
                addMessageToChat('assistant', data.response);
            } catch (error) {
                console.error('Error sending tool response:', error);
                removeTypingIndicator();
                addMessageToChat('assistant', 'Sorry, there was an error processing your request. Please try again.');
            }
        };
        
        allowOnceButton.addEventListener('click', handleApproval);
        allowChatButton.addEventListener('click', handleApproval);
    }
}); 