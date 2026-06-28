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
                const rawItem = data.items[0];

                // Search returns Item records (physical holdings); book data is in itemOf
                const instance = [].concat(rawItem['@type']).includes('Item') && rawItem.itemOf
                    ? rawItem.itemOf
                    : rawItem;

                // Resolve agent name — may require a fetch if only @id is present
                const resolveAgentName = async (agent) => {
                    if (!agent) return null;
                    if (agent.name) return agent.name;
                    if (agent.familyName || agent.givenName) {
                        return [agent.givenName, agent.familyName].filter(Boolean).join(' ');
                    }
                    if (agent['@id']) {
                        try {
                            const url = agent['@id'].replace(/#.*$/, '/data.jsonld');
                            const resp = await fetch(url, { headers: { 'Accept': 'application/ld+json' } });
                            const agentData = await resp.json();
                            const graph = agentData['@graph'] || [];
                            const person = graph.find(e => e['@id'] === agent['@id']) || agentData;
                            if (person.name) return person.name;
                            if (person.familyName || person.givenName) {
                                return [person.givenName, person.familyName].filter(Boolean).join(' ');
                            }
                        } catch (e) { console.log('Agent fetch error:', e); }
                    }
                    return null;
                };

                if (instance) {
                    // Title
                    const titleSource = instance.hasTitle?.length ? instance : instance.instanceOf;
                    let title = '';
                    if (titleSource?.hasTitle?.length) {
                        const titleObj = titleSource.hasTitle[0];
                        title = titleObj.mainTitle || '';
                        if (titleObj.hasPart?.length) {
                            const part = titleObj.hasPart[0];
                            if (part.partNumber) title += ' ' + [].concat(part.partNumber).join(', ');
                            if (part.partName) title += ': ' + [].concat(part.partName).join(', ');
                        }
                    }

                    // Authors — fetch agent records if names aren't inline
                    const contributions = [
                        ...(instance.instanceOf?.contribution || []),
                        ...(instance.contribution || [])
                    ];
                    let authors = [];
                    for (const contrib of contributions) {
                        const types = [].concat(contrib['@type'] || []);
                        const isAuthor = types.includes('PrimaryContribution') ||
                            contrib.role?.some(r => r['@id']?.includes('author') || r.code === 'aut');
                        if (isAuthor) {
                            const name = await resolveAgentName(contrib.agent);
                            if (name) authors.push(name);
                        }
                    }
                    if (authors.length === 0) {
                        for (const contrib of contributions) {
                            const name = await resolveAgentName(contrib.agent);
                            if (name) { authors.push(name); break; }
                        }
                    }
                    if (authors.length === 0 && instance.responsibilityStatement) {
                        authors = [instance.responsibilityStatement.split(',')[0].trim()];
                    }
                    
                    // Publisher and date
                    let publisher, publishedDate;
                    if (instance.publication?.length) {
                        const pub = instance.publication[0];
                        const label = pub.agent?.label;
                        publisher = Array.isArray(label) ? label[0] : label;
                        if (!publisher) publisher = pub.agent?.name;
                        publishedDate = pub.year || pub.date;
                    }

                    // Page count
                    let pageCount;
                    if (instance.extent?.length) {
                        const extentLabel = instance.extent[0].label;
                        if (extentLabel) {
                            const match = (Array.isArray(extentLabel) ? extentLabel[0] : extentLabel).match(/(\d+)\s*s/i);
                            if (match) pageCount = parseInt(match[1]);
                        }
                    }

                    // Language
                    let language;
                    if (instance.instanceOf?.language?.length) {
                        language = instance.instanceOf.language[0].code;
                    }

                    // Description
                    let description;
                    if (instance.instanceOf?.hasNote?.length) {
                        description = instance.instanceOf.hasNote[0].label?.[0];
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
