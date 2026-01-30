// ============================================
// Book API Providers
// ============================================

export const BookAPIs = {
    // Libris (Swedish National Library)
    libris: {
        name: 'Libris (KB)',
        async search(isbn) {
            const response = await fetch(`https://libris.kb.se/find.jsonld?q=${isbn}&_limit=5`, {
                headers: {
                    'Accept': 'application/ld+json'
                }
            });
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                // Find a book item (Print, Electronic, or first item)
                const bookItem = data.items.find(item => 
                    item['@type'] === 'Print' || item['@type'] === 'Electronic'
                ) || data.items[0];
                
                if (bookItem) {
                    // Extract title
                    let title = '';
                    if (bookItem.hasTitle && bookItem.hasTitle.length > 0) {
                        const titleObj = bookItem.hasTitle[0];
                        title = titleObj.mainTitle || '';
                        if (titleObj.hasPart && titleObj.hasPart.length > 0) {
                            const part = titleObj.hasPart[0];
                            if (part.partNumber) title += ' ' + part.partNumber.join(', ');
                            if (part.partName) title += ': ' + part.partName.join(', ');
                        }
                    }
                    
                    // Helper function to extract author name from agent
                    const getAgentName = (agent) => {
                        if (!agent) return null;
                        if (agent.name) return agent.name;
                        // Handle Person with familyName/givenName
                        if (agent.familyName || agent.givenName) {
                            const parts = [agent.givenName, agent.familyName].filter(Boolean);
                            return parts.join(' ');
                        }
                        return null;
                    };
                    
                    // Extract authors - check both direct contribution and instanceOf.contribution
                    let authors = [];
                    const contributions = bookItem.instanceOf?.contribution || bookItem.contribution || [];
                    for (const contrib of contributions) {
                        // Prioritize authors (PrimaryContribution or role=author)
                        const isAuthor = contrib['@type'] === 'PrimaryContribution' ||
                            contrib.role?.some(r => 
                                r['@id']?.includes('author') || 
                                r.code === 'aut'
                            );
                        if (isAuthor) {
                            const name = getAgentName(contrib.agent);
                            if (name) authors.push(name);
                        }
                    }
                    // If no authors found with role, try responsibilityStatement
                    if (authors.length === 0 && bookItem.responsibilityStatement) {
                        authors = [bookItem.responsibilityStatement.split(',')[0].trim()];
                    }
                    
                    // Extract publisher and date
                    let publisher, publishedDate;
                    if (bookItem.publication && bookItem.publication.length > 0) {
                        const pub = bookItem.publication[0];
                        // agent.label can be a string or array
                        const label = pub.agent?.label;
                        publisher = Array.isArray(label) ? label[0] : label;
                        if (!publisher) publisher = pub.agent?.name;
                        publishedDate = pub.year || pub.date;
                    }
                    
                    // Extract page count
                    let pageCount;
                    if (bookItem.extent && bookItem.extent.length > 0) {
                        const extentLabel = bookItem.extent[0].label;
                        if (extentLabel) {
                            const match = (Array.isArray(extentLabel) ? extentLabel[0] : extentLabel).match(/(\d+)\s*s/i);
                            if (match) pageCount = parseInt(match[1]);
                        }
                    }
                    
                    // Extract language
                    let language;
                    if (bookItem.instanceOf?.language && bookItem.instanceOf.language.length > 0) {
                        language = bookItem.instanceOf.language[0].code;
                    }
                    
                    // Extract description/notes
                    let description;
                    if (bookItem.instanceOf?.hasNote && bookItem.instanceOf.hasNote.length > 0) {
                        description = bookItem.instanceOf.hasNote[0].label?.[0];
                    }
                    
                    return {
                        found: true,
                        book: {
                            title,
                            authors: authors.length > 0 ? authors : undefined,
                            publisher,
                            publishedDate,
                            pageCount,
                            description,
                            language
                        }
                    };
                }
            }
            return { found: false };
        }
    },
    
    // Google Books API
    googleBooks: {
        name: 'Google Books',
        async search(isbn) {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
            const data = await response.json();
            
            if (data.totalItems > 0) {
                const vol = data.items[0].volumeInfo;
                return {
                    found: true,
                    book: {
                        title: vol.title,
                        authors: vol.authors,
                        publisher: vol.publisher,
                        publishedDate: vol.publishedDate,
                        pageCount: vol.pageCount,
                        description: vol.description,
                        imageLinks: vol.imageLinks,
                        categories: vol.categories,
                        language: vol.language
                    }
                };
            }
            return { found: false };
        }
    },
    
    // Open Library API
    openLibrary: {
        name: 'Open Library',
        async search(isbn) {
            const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
            const data = await response.json();
            
            const bookData = data[`ISBN:${isbn}`];
            if (bookData) {
                return {
                    found: true,
                    book: {
                        title: bookData.title,
                        authors: bookData.authors?.map(a => a.name),
                        publisher: bookData.publishers?.[0]?.name,
                        publishedDate: bookData.publish_date,
                        pageCount: bookData.number_of_pages,
                        description: bookData.notes || bookData.excerpts?.[0]?.text,
                        imageLinks: {
                            thumbnail: bookData.cover?.medium || bookData.cover?.small,
                            smallThumbnail: bookData.cover?.small
                        },
                        subjects: bookData.subjects?.map(s => s.name)
                    }
                };
            }
            return { found: false };
        }
    },
    
    // OpenBD (Japanese books)
    openBD: {
        name: 'OpenBD',
        async search(isbn) {
            const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
            const data = await response.json();
            
            if (data && data[0]) {
                const summary = data[0].summary;
                const onix = data[0].onix;
                return {
                    found: true,
                    book: {
                        title: summary.title,
                        authors: summary.author ? [summary.author] : undefined,
                        publisher: summary.publisher,
                        publishedDate: summary.pubdate,
                        description: onix?.CollateralDetail?.TextContent?.[0]?.Text,
                        imageLinks: {
                            thumbnail: summary.cover
                        }
                    }
                };
            }
            return { found: false };
        }
    }
};
