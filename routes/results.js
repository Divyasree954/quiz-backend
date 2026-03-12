const express = require('express');
const Result = require('../models/Result');
const Quiz = require('../models/Quiz');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route POST /api/results/submit - Submit quiz answers
router.post('/submit', protect, async (req, res) => {
  try {
    const { quizId, answers, timeTaken } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    let score = 0;
    const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    const processedAnswers = [];

    quiz.questions.forEach((question, index) => {
      const userAnswer = answers[index];
      const correctOptionIndex = question.options.findIndex(o => o.isCorrect);
      const isCorrect = userAnswer !== undefined && userAnswer === correctOptionIndex;
      const pointsEarned = isCorrect ? question.points : 0;
      score += pointsEarned;

      processedAnswers.push({
        questionIndex: index,
        selectedOption: userAnswer,
        isCorrect,
        pointsEarned
      });
    });

    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

    const result = await Result.create({
      quiz: quizId,
      user: req.user._id,
      answers: processedAnswers,
      score,
      totalPoints,
      percentage,
      timeTaken
    });

    // Increment attempt count
    await Quiz.findByIdAndUpdate(quizId, { $inc: { totalAttempts: 1 } });

    // Populate and return with correct answers
    const populatedResult = await Result.findById(result._id)
      .populate('quiz', 'title questions category difficulty');

    res.status(201).json({
      message: 'Quiz submitted successfully',
      result: populatedResult,
      score,
      totalPoints,
      percentage
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @route GET /api/results/my - Get user's results
router.get('/my', protect, async (req, res) => {
  try {
    const results = await Result.find({ user: req.user._id })
      .populate('quiz', 'title category difficulty')
      .sort({ completedAt: -1 });
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route GET /api/results/leaderboard/:quizId - Get leaderboard
router.get('/leaderboard/:quizId', async (req, res) => {
  try {
    const results = await Result.find({ quiz: req.params.quizId })
      .populate('user', 'username')
      .sort({ percentage: -1, timeTaken: 1 })
      .limit(10);
    res.json({ leaderboard: results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route GET /api/results/:id - Get specific result
router.get('/:id', protect, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id)
      .populate('quiz')
      .populate('user', 'username');

    if (!result) return res.status(404).json({ message: 'Result not found' });

    if (result.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json({ result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
