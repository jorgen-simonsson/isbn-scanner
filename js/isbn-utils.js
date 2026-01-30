// ============================================
// ISBN Validation and Extraction Utilities
// ============================================

/**
 * Validate ISBN-13 checksum
 */
export function validateISBN13(isbn) {
    let sum = 0;
    for (let i = 0; i < 13; i++) {
        const digit = parseInt(isbn[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    return sum % 10 === 0;
}

/**
 * Validate ISBN-10 format and checksum
 */
export function isValidISBN10(code) {
    const cleaned = code.replace(/[\s\-]/g, '').toUpperCase();
    
    if (cleaned.length !== 10) return false;
    if (!/^\d{9}[\dX]$/.test(cleaned)) return false;
    
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cleaned[i]) * (10 - i);
    }
    
    const lastChar = cleaned[9];
    sum += lastChar === 'X' ? 10 : parseInt(lastChar);
    
    return sum % 11 === 0;
}

/**
 * Check if a code is a valid ISBN (10 or 13)
 */
export function isValidISBN(code) {
    // Remove any hyphens or spaces
    const cleaned = code.replace(/[\s\-]/g, '');
    
    // Check for ISBN-13
    if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) {
        // Should start with 978 or 979 for books
        if (cleaned.startsWith('978') || cleaned.startsWith('979')) {
            return validateISBN13(cleaned);
        }
    }
    
    // Check for ISBN-10
    if (cleaned.length === 10) {
        return isValidISBN10(cleaned);
    }
    
    return false;
}

/**
 * Extract ISBN from OCR text using multiple strategies
 */
export function extractISBN(text) {
    console.log('Raw OCR text:', text);
    
    // Normalize the text - keep original for pattern matching
    const normalizedText = text
        .toUpperCase()
        .replace(/[Il|]/g, '1')      // Common OCR mistakes: I, l, | -> 1
        .replace(/[Oo]/g, '0')        // O -> 0 in number context
        .replace(/[Ss]/g, '5')        // S -> 5 in number context  
        .replace(/[Bb]/g, '8')        // B -> 8 in number context
        .replace(/[Zz]/g, '2')        // Z -> 2 in number context
        .replace(/\n/g, ' ');         // Newlines to spaces
    
    // Strategy 1: Look for "ISBN" keyword followed by numbers
    const isbnLabelPatterns = [
        /ISBN[-:\s]*(?:13)?[-:\s]*((?:97[89])[-\s.\d]{10,17})/gi,
        /ISBN[-:\s]*(?:10)?[-:\s]*(\d[-\s.\d]{9,12}[X\d])/gi,
        /ISBN\s*[:=]?\s*(\d[\d\s\-\.]{9,16}[\dX])/gi
    ];
    
    for (const pattern of isbnLabelPatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const candidate = match[1].replace(/[\s\-\.]/g, '');
            console.log('ISBN label match candidate:', candidate);
            if (candidate.length === 13 && validateISBN13(candidate)) {
                return candidate;
            }
            if (candidate.length === 10 && isValidISBN10(candidate)) {
                return candidate;
            }
        }
    }
    
    // Strategy 2: Look for 978/979 prefix (ISBN-13)
    // Handle cases where digits might be stuck to other text
    const isbn13Patterns = [
        // Standard with possible separators
        /(97[89])[-\s.]?(\d)[-\s.]?(\d{2})[-\s.]?(\d{5})[-\s.]?(\d)/g,
        // Compact - 13 digits starting with 978/979
        /(97[89]\d{10})/g,
        // With text around it - extract 978/979 followed by 10 more digits
        /(?:^|[^\d])(97[89])(\d{10})(?:[^\d]|$)/g,
        // Broken by OCR - might have spaces/chars between
        /(97[89])[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)/g
    ];
    
    for (const pattern of isbn13Patterns) {
        const matches = normalizedText.matchAll(pattern);
        for (const match of matches) {
            // Join all capture groups and clean
            const candidate = match.slice(1).join('').replace(/[\s\-\.]/g, '');
            const digits = candidate.replace(/[^\d]/g, '');
            console.log('ISBN-13 pattern candidate:', digits);
            if (digits.length === 13 && validateISBN13(digits)) {
                return digits;
            }
        }
    }
    
    // Strategy 3: Find any sequence of 13 digits that validates as ISBN-13
    const allDigitSequences = normalizedText.replace(/[^\d\s]/g, ' ').match(/\d[\d\s]{11,20}\d/g) || [];
    for (const seq of allDigitSequences) {
        const digits = seq.replace(/\s/g, '');
        if (digits.length >= 13) {
            // Try to find a valid ISBN-13 within
            for (let i = 0; i <= digits.length - 13; i++) {
                const candidate = digits.substring(i, i + 13);
                if ((candidate.startsWith('978') || candidate.startsWith('979')) && validateISBN13(candidate)) {
                    console.log('Found ISBN-13 in sequence:', candidate);
                    return candidate;
                }
            }
        }
    }
    
    // Strategy 4: ISBN-10 (10 digits, last can be X)
    const isbn10Patterns = [
        /(\d)[-\s.]?(\d{2})[-\s.]?(\d{5})[-\s.]?([\dX])/gi,
        /(\d{9}[\dX])/gi,
        /(?:^|[^\dX])(\d{9})([\dX])(?:[^\dX]|$)/gi
    ];
    
    for (const pattern of isbn10Patterns) {
        const matches = text.toUpperCase().matchAll(pattern);
        for (const match of matches) {
            const candidate = match.slice(1).join('').replace(/[\s\-\.]/g, '').toUpperCase();
            const clean = candidate.replace(/[^\dX]/g, '');
            console.log('ISBN-10 pattern candidate:', clean);
            if (clean.length === 10 && isValidISBN10(clean)) {
                return clean;
            }
        }
    }
    
    // Strategy 5: Brute force - find any 10 or 13 digit number and validate
    const allNumbers = text.match(/\d+/g) || [];
    // Also try concatenating adjacent numbers
    const concatenated = allNumbers.join('');
    
    // Look for ISBN-13 in concatenated
    for (let i = 0; i <= concatenated.length - 13; i++) {
        const candidate = concatenated.substring(i, i + 13);
        if ((candidate.startsWith('978') || candidate.startsWith('979')) && validateISBN13(candidate)) {
            console.log('Found ISBN-13 in concatenated numbers:', candidate);
            return candidate;
        }
    }
    
    // Look for ISBN-10 in concatenated
    for (let i = 0; i <= concatenated.length - 10; i++) {
        const candidate = concatenated.substring(i, i + 10);
        if (isValidISBN10(candidate)) {
            console.log('Found ISBN-10 in concatenated numbers:', candidate);
            return candidate;
        }
    }
    
    // Strategy 6: Handle completely mangled text - extract all digits and try combinations
    const justDigits = normalizedText.replace(/[^\d]/g, '');
    if (justDigits.length >= 13) {
        // Sliding window for ISBN-13
        for (let i = 0; i <= justDigits.length - 13; i++) {
            const candidate = justDigits.substring(i, i + 13);
            if ((candidate.startsWith('978') || candidate.startsWith('979')) && validateISBN13(candidate)) {
                console.log('Found ISBN-13 via sliding window:', candidate);
                return candidate;
            }
        }
    }
    
    console.log('No valid ISBN found in text');
    return null;
}
