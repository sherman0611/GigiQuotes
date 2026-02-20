function scrollToTop() {
    window.scrollTo({
        top: 0,
    });
}

/**
 * Handles the Share Button click from the quote list
 */
function handleShareClick(event, videoId, seconds) {
    event.preventDefault();
    event.stopPropagation();

    const time = Math.floor(seconds);
    const url = `https://youtu.be/${videoId}?t=${time}`;
    const modal = document.getElementById("shareModal");
    const input = document.getElementById("shareLinkInput");
    const twitterBtn = document.getElementById("twitterShareBtn");

    if (!modal || !input || !twitterBtn) return; // Safety check

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

    if (!input || !btn) return;

    input.select();
    navigator.clipboard.writeText(input.value)
        .then(() => {
            const originalText = btn.innerText;
            btn.innerText = "Saved!";
            setTimeout(() => { btn.innerText = originalText; }, 2000);
        })
        .catch(err => console.error('Failed to copy: ', err));
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
    const modal = document.getElementById("shareModal");
    if (modal) modal.style.display = "none";
}

// Close modal if user clicks outside of it
window.onclick = function(event) {
    const modal = document.getElementById("shareModal");
    if (event.target == modal) {
        closeModal();
    }
}