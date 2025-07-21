import express from 'express';
import cors from 'cors';
import { PrismaClient, LinkPrecedence } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
app.use(cors());
app.use(express.json());
// Helper function to get all linked contacts starting from a primary contact
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
// Helper function to find the primary contact ID from any contact in a linked group
async function findPrimaryContactId(contactId) {
    const contact = await prisma.contact.findUnique({
        where: { id: contactId }
    });
    if (!contact) {
        throw new Error('Contact not found');
    }
    return contact.linkPrecedence === 'primary' ? contact.id : contact.linkedId;
}
// Helper function to consolidate contact information
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
        // Find existing contacts that match email or phone
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
            // No existing contacts - create new primary contact
            const newContact = await prisma.contact.create({
                data: {
                    email,
                    phoneNumber: phoneNumber?.toString(),
                    linkPrecedence: LinkPrecedence.primary,
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
        // Group existing contacts by their primary contact
        const contactGroups = new Map();
        for (const contact of existingContacts) {
            const primaryId = await findPrimaryContactId(contact.id);
            if (!contactGroups.has(primaryId)) {
                contactGroups.set(primaryId, []);
            }
            contactGroups.get(primaryId).push(contact);
        }
        // If contacts belong to multiple groups, we need to merge them
        const primaryIds = Array.from(contactGroups.keys()).sort();
        const oldestPrimaryId = primaryIds[0];
        // If multiple primary contacts need to be linked
        if (primaryIds.length > 1) {
            // Convert newer primary contacts to secondary
            for (let i = 1; i < primaryIds.length; i++) {
                const primaryToUpdate = primaryIds[i];
                await prisma.contact.update({
                    where: { id: primaryToUpdate },
                    data: {
                        linkPrecedence: LinkPrecedence.secondary,
                        linkedId: oldestPrimaryId
                    }
                });
                // Update all contacts that were linked to the old primary
                await prisma.contact.updateMany({
                    where: { linkedId: primaryToUpdate },
                    data: { linkedId: oldestPrimaryId }
                });
            }
        }
        // Check if we need to create a new secondary contact
        const allLinkedContacts = await getLinkedContacts(oldestPrimaryId);
        const hasEmail = email && allLinkedContacts.some(c => c.email === email);
        const hasPhone = phoneNumber && allLinkedContacts.some(c => c.phoneNumber === phoneNumber.toString());
        // Create new secondary contact if we have new information
        if ((email && !hasEmail) || (phoneNumber && !hasPhone)) {
            // Only create if it's actually new information
            const exactMatch = allLinkedContacts.some(c => c.email === email && c.phoneNumber === phoneNumber?.toString());
            if (!exactMatch) {
                await prisma.contact.create({
                    data: {
                        email,
                        phoneNumber: phoneNumber?.toString(),
                        linkPrecedence: LinkPrecedence.secondary,
                        linkedId: oldestPrimaryId
                    }
                });
            }
        }
        // Get final consolidated contact information
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
export default app;
