
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');


const app = express();
const PORT = 3001;


// Persistent bookings array (load from file)
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
let bookings = [];
function loadBookings() {
  try {
    const data = fs.readFileSync(BOOKINGS_FILE, 'utf-8');
    bookings = JSON.parse(data);
  } catch (e) {
    bookings = [];
  }
}
function saveBookings() {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}
loadBookings();

app.use(cors());
app.use(bodyParser.json());

// Check car availability for a given vehicle and date range
app.post('/api/check-availability', (req, res) => {
  const { vehicle, pickupDate, returnDate } = req.body;
  // Check if any booking for this vehicle overlaps with requested dates
  const isBooked = bookings.some(b =>
    b.vehicle === vehicle &&
    (
      (pickupDate <= b.returnDate && returnDate >= b.pickupDate)
    )
  );
  res.json({ available: !isBooked });
});


// POST /api/book - receive booking, send email, and store in memory
app.post('/api/book', async (req, res) => {
  console.log('Received booking:', req.body); // Log incoming booking data
  const { vehicle, pickupDate, returnDate, location, name, email, contact } = req.body;

  // Validate location (required and not empty)
  let safeLocation = location && location.trim() ? location.trim() : 'Main Office (Batkhela, Malakand, KPK)';

  // Generate a unique id for the new booking
  let newId = 1;
  if (bookings.length > 0) {
    // Find the max id in existing bookings (skip undefined)
    const maxId = Math.max(0, ...bookings.map(b => typeof b.id === 'number' ? b.id : 0));
    newId = maxId + 1;
  }

  // Add booking to in-memory array
  const booking = {
    id: newId,
    vehicle,
    pickupDate,
    returnDate,
    location: safeLocation,
    name,
    email: email || 'No email provided',
    contact,
    status: 'Pending',
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);
  saveBookings();

  // Set up Nodemailer transporter (replace with your Gmail and App Password)
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'a69914khan@gmail.com', // your Gmail address
      pass: 'alttgxendaufawyf'      // your Gmail App Password (no spaces)
    }
  });

  let mailOptions = {
    from: 'a69914khan@gmail.com',
    to: 'a69914khan@gmail.com',
    subject: 'New Car Booking',
    text: `
      Vehicle: ${vehicle}
      Pickup Date: ${pickupDate}
      Return Date: ${returnDate}
      Location: ${location}
      Name: ${name}
      Email: ${email || 'No email provided'}
      Contact: ${contact}
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error); // Log email errors
    res.status(500).json({ success: false, error: error.message });
  }
});


// GET /api/bookings - return all bookings (with optional search/filter)
app.get('/api/bookings', (req, res) => {
  let result = bookings;
  // Simple search/filter by query params
  const { q, status } = req.query;
  if (q) {
    const ql = q.toLowerCase();
    result = result.filter(b =>
      b.name.toLowerCase().includes(ql) ||
      b.contact.toLowerCase().includes(ql) ||
      b.vehicle.toLowerCase().includes(ql) ||
      b.location.toLowerCase().includes(ql)
    );
  }
  if (status) {
    result = result.filter(b => b.status === status);
  }
  res.json(result);
});

// PATCH /api/bookings/:id - update booking status by booking id
app.patch('/api/bookings/:id', (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  // Find booking by id (as string or number)
  const idx = bookings.findIndex(b => String(b.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  if (status) {
    bookings[idx].status = status;
    saveBookings();
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'Invalid status' });
});


// POST /api/bookings/:id/accept - accept booking and send confirmation email
app.post('/api/bookings/:id/accept', async (req, res) => {
  const id = req.params.id;
  const idx = bookings.findIndex(b => String(b.id) === String(id));
  
  if (idx === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  
  const booking = bookings[idx];
  
  // Update status to accepted
  booking.status = 'Accepted';
  saveBookings();
  
  // Only send confirmation email if email is present and looks valid
  if (booking.email && booking.email.includes('@')) {
    try {
      let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'a69914khan@gmail.com',
          pass: 'alttgxendaufawyf'
        }
      });
      let mailOptions = {
        from: '"AK Rent A Car" <a69914khan@gmail.com>',
        to: booking.email,
        subject: 'Your Booking is Confirmed! 🚗',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
            <div style="text-align: center; background-color: #60a5fa; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">🎉 Booking Confirmed!</h1>
            </div>
            <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Dear <strong>${booking.name}</strong>,</p>
              <p style="font-size: 16px; color: #555; margin-bottom: 20px;">Great news! Your car rental booking has been <strong>accepted</strong> and confirmed.</p>
              <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #60a5fa;">
                <h3 style="color: #1e40af; margin-top: 0;">📋 Booking Details:</h3>
                <p><strong>Vehicle:</strong> ${booking.vehicle}</p>
                <p><strong>Pickup Date:</strong> ${booking.pickupDate}</p>
                <p><strong>Return Date:</strong> ${booking.returnDate}</p>
                <p><strong>Location:</strong> ${booking.location}</p>
                <p><strong>Contact:</strong> ${booking.contact}</p>
              </div>
              <p style="font-size: 16px; color: #555; margin-bottom: 20px;">Please ensure you have the following documents ready for pickup:</p>
              <ul style="color: #555; margin-bottom: 20px;">
                <li>Valid CNIC (National ID)</li>
                <li>Valid Driving License</li>
              </ul>
              <p style="font-size: 16px; color: #555; margin-bottom: 20px;">If you have any questions or need to make changes, please contact us immediately.</p>
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px;">Thank you for choosing <strong>AK Rent A Car</strong>!</p>
                <p style="color: #6b7280; font-size: 14px;">📍 Main Office: Batkhela, Malakand, KPK</p>
                <p style="color: #6b7280; font-size: 14px;">📞 Contact: 0333-3323394 | 0300-5181628</p>
              </div>
            </div>
          </div>
        `,
        text: `
Dear ${booking.name},

Your car rental booking has been ACCEPTED and confirmed!

Booking Details:
- Vehicle: ${booking.vehicle}
- Pickup Date: ${booking.pickupDate}
- Return Date: ${booking.returnDate}
- Location: ${booking.location}
- Contact: ${booking.contact}

Please ensure you have:
- Valid CNIC (National ID)
- Valid Driving License

If you have any questions, contact us at 0333-3323394.

Thank you for choosing AK Rent A Car!
📍 Main Office: Batkhela, Malakand, KPK
📞 Contact: 0333-3323394 | 0300-5181628
        `
      };
      await transporter.sendMail(mailOptions);
      console.log('Confirmation email sent to:', booking.email);
      res.json({ 
        success: true, 
        message: 'Booking accepted and confirmation email sent to customer' 
      });
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      res.json({ 
        success: true, 
        message: 'Booking accepted but email failed to send',
        error: error.message 
      });
    }
  } else {
    // No email provided, just update status
    res.json({
      success: true,
      message: 'Booking accepted (no email sent, email not provided)'
    });
  }
});

// DELETE /api/bookings/:id - delete booking by id
app.delete('/api/bookings/:id', (req, res) => {
  const id = req.params.id;
  const idx = bookings.findIndex(b => String(b.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  bookings.splice(idx, 1);
  saveBookings();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});