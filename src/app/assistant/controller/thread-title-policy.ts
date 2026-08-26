export const createInitialThreadTitle = (text: string, hasImage: boolean) => {
    const trimmedText = text.trim();
    if (trimmedText.length > 0) {
        return trimmedText;
    }

    return hasImage ? "Image Message" : "New Chat";
};

export const createEditedBranchThreadTitle = (text: string) => {
    const trimmedText = text.trim();
    return trimmedText.length > 0 ? trimmedText : "Branch thread";
};

export const createMessageBranchThreadTitle = () => {
    return "Brand new thread";
};
