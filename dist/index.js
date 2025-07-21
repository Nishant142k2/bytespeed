"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
async function getLinkedContacts(primaryContactId) {
    const contacts = await prisma.contact.findMany({
        where: {
            OR: [
                { id: primaryContactId },
                { linkedId: primaryContactId }
            ]
        },
        orderBy: {
            createdAt: 'asc'
        }
    });
    return contacts;
}
async function findPrimaryContactId(contactId) {
    const contact = await prisma.contact.findUnique({
        where: { id: contactId }
    });
    if (!contact) {
        throw new Error('Contact not found');
    }
    return contact.linkPrecedence === 'primary' ? contact.id : contact.linkedId;
}
function consolidateContacts(contacts) {
    const primary = contacts.find(c => c.linkPrecedence === 'primary');
    if (!primary) {
        throw new Error('No primary contact found');
    }
    const secondaries = contacts.filter(c => c.linkPrecedence === 'secondary');
    const emails = Array.from(new Set([
        primary.email,
        ...secondaries.map(c => c.email)
    ].filter((email) => Boolean(email))));
    const phoneNumbers = Array.from(new Set([
        primary.phoneNumber,
        ...secondaries.map(c => c.phoneNumber)
    ].filter((phone) => Boolean(phone))));
    return {
        contact: {
            primaryContatctId: primary.id,
            emails,
            phoneNumbers,
            secondaryContactIds: secondaries.map(c => c.id)
        }
    };
}
app.post('/identify', async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        if (!email && !phoneNumber) {
            return res.status(400).json({
                error: 'Either email or phoneNumber is required'
            });
        }
        const existingContacts = await prisma.contact.findMany({
            where: {
                OR: [
                    ...(email ? [{ email }] : []),
                    ...(phoneNumber ? [{ phoneNumber: phoneNumber.toString() }] : [])
                ]
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        if (existingContacts.length === 0) {
            const newContact = await prisma.contact.create({
                data: {
                    email,
                    phoneNumber: phoneNumber?.toString(),
                    linkPrecedence: client_1.LinkPrecedence.primary,
                    linkedId: null
                }
            });
            return res.json({
                contact: {
                    primaryContatctId: newContact.id,
                    emails: newContact.email ? [newContact.email] : [],
                    phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
                    secondaryContactIds: []
                }
            });
        }
        const contactGroups = new Map();
        for (const contact of existingContacts) {
            const primaryId = await findPrimaryContactId(contact.id);
            if (!contactGroups.has(primaryId)) {
                contactGroups.set(primaryId, []);
            }
            contactGroups.get(primaryId).push(contact);
        }
        const primaryIds = Array.from(contactGroups.keys()).sort();
        const oldestPrimaryId = primaryIds[0];
        if (primaryIds.length > 1) {
            for (let i = 1; i < primaryIds.length; i++) {
                const primaryToUpdate = primaryIds[i];
                await prisma.contact.update({
                    where: { id: primaryToUpdate },
                    data: {
                        linkPrecedence: client_1.LinkPrecedence.secondary,
                        linkedId: oldestPrimaryId
                    }
                });
                await prisma.contact.updateMany({
                    where: { linkedId: primaryToUpdate },
                    data: { linkedId: oldestPrimaryId }
                });
            }
        }
        const allLinkedContacts = await getLinkedContacts(oldestPrimaryId);
        const hasEmail = email && allLinkedContacts.some(c => c.email === email);
        const hasPhone = phoneNumber && allLinkedContacts.some(c => c.phoneNumber === phoneNumber.toString());
        if ((email && !hasEmail) || (phoneNumber && !hasPhone)) {
            const exactMatch = allLinkedContacts.some(c => c.email === email && c.phoneNumber === phoneNumber?.toString());
            if (!exactMatch) {
                await prisma.contact.create({
                    data: {
                        email,
                        phoneNumber: phoneNumber?.toString(),
                        linkPrecedence: client_1.LinkPrecedence.secondary,
                        linkedId: oldestPrimaryId
                    }
                });
            }
        }
        const finalContacts = await getLinkedContacts(oldestPrimaryId);
        const response = consolidateContacts(finalContacts);
        res.json(response);
    }
    catch (error) {
        console.error('Error in /identify:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Bitespeed Identity Service running on port ${PORT}`);
});
exports.default = app;
