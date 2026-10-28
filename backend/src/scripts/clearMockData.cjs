const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/USER/Documents/projetcs/Betway/backend/.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // 1. Delete all payments and payouts
    const paymentsResult = await mongoose.connection.collection('payments').deleteMany({});
    console.log(`Deleted ${paymentsResult.deletedCount} payments.`);
    const payoutsResult = await mongoose.connection.collection('payouts').deleteMany({});
    console.log(`Deleted ${payoutsResult.deletedCount} payouts.`);

    // 2. Delete non-admin test users (guest checkouts)
    const usersResult = await mongoose.connection.collection('users').deleteMany({ role: { $ne: 'admin' } });
    console.log(`Deleted ${usersResult.deletedCount} non-admin test users.`);

    // 3. Confirm remaining collections
    const remainingPayments = await mongoose.connection.collection('payments').countDocuments();
    const remainingPayouts = await mongoose.connection.collection('payouts').countDocuments();
    const remainingUsers = await mongoose.connection.collection('users').countDocuments();
    const remainingAdmins = await mongoose.connection.collection('users').countDocuments({ role: 'admin' });
    const remainingPrices = await mongoose.connection.collection('boardprices').countDocuments();
    const remainingStats = await mongoose.connection.collection('stats').countDocuments();
    const remainingTips = await mongoose.connection.collection('tips').countDocuments();

    console.log({
      remainingPayments,
      remainingPayouts,
      remainingUsers,
      remainingAdmins,
      remainingPrices,
      remainingStats,
      remainingTips,
    });

    await mongoose.disconnect();
    console.log('Done.');
  } catch (err) {
    console.error('Error clearing mock data:', err);
    process.exit(1);
  }
})();
