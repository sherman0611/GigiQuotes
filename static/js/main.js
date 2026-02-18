function scrollToTop() {
    window.scrollTo({
        top: 0,
    });
}

/**
 * Handles the Share Button click from the quote list
 */
function handleShareClick(event, videoId, seconds) {
    event.stopPropagation();
    initializeShareModal(); // Ensure it exists

    const time = Math.floor(seconds);
    const url = `https://youtu.be/${videoId}?t=${time}`;
    const modal = document.getElementById("shareModal");
    const input = document.getElementById("shareLinkInput");
    const twitterBtn = document.getElementById("twitterShareBtn");

    input.value = url;
    const tweetText = encodeURIComponent(`${url}\n\nFind more Gigi Murin👧 quotes on https://gigiquotes.com !`);
    twitterBtn.href = `https://twitter.com/intent/tweet?text=${tweetText}`;

    modal.style.display = "block";
}

/**
 * Copy logic with feedback
 */
function copyFromModal() {
    const input = document.getElementById("shareLinkInput");
    const btn = document.getElementById("modalCopyBtn");
    
    input.select();
    navigator.clipboard.writeText(input.value);
    
    const originalText = btn.innerText;
    btn.innerText = "Saved!";
    setTimeout(() => { btn.innerText = originalText; }, 2000);
}

// Function to handle share button specifically
function handleShareClick(event, videoId, seconds) {
    // 1. Prevents the 'seekToTime' on the parent div from firing
    event.stopPropagation(); 
    
    openShareModal(videoId, seconds);
}

function openShareModal(videoId, seconds) {
    const time = Math.floor(seconds);
    const url = `https://youtu.be/${videoId}?t=${time}`;
    const modal = document.getElementById("shareModal");
    const input = document.getElementById("shareLinkInput");
    const twitterBtn = document.getElementById("twitterShareBtn");

    input.value = url;

    const tweetText = encodeURIComponent(url + "\n\nFind more Gigi Murin👧 quotes on https://gigiquotes.com !");
    twitterBtn.href = `https://twitter.com/intent/tweet?text=${tweetText}`;

    modal.style.display = "block";
}

function closeModal() {
    document.getElementById("shareModal").style.display = "none";
}

function copyFromModal() {
    const input = document.getElementById("shareLinkInput");
    const btn = document.getElementById("modalCopyBtn");
    
    input.select();
    navigator.clipboard.writeText(input.value);
    
    const originalText = btn.innerText;
    btn.innerText = "Saved!";
    setTimeout(() => { btn.innerText = originalText; }, 2000);
}

// Close modal if user clicks outside of it
window.onclick = function(event) {
    const modal = document.getElementById("shareModal");
    if (event.target == modal) {
        closeModal();
    }
}