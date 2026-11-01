'use client';

import React from 'react';
import Navigation from '@/components/common/Navigation';

const PrivacyPage: React.FC = () => {
  // const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Last updated: January 2025
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Introduction
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              ChordMini is a self-hosted music analysis application.
              This Privacy Policy explains how we collect, use, and protect your information when you use our service.
            </p>
            <p>
              We are committed to protecting your privacy and ensuring transparency about our data practices.
            </p>
          </div>
        </div>

        {/* Information We Collect */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Information We Collect
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Audio Data
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>â€¢ YouTube URLs you submit for analysis</li>
                <li>â€¢ Audio files you upload (processed locally, not permanently stored)</li>
                <li>â€¢ Analysis results (chord progressions, beat information)</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Technical Information
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>â€¢ Browser type and version</li>
                <li>â€¢ Device information and screen resolution</li>
                <li>â€¢ Usage patterns and feature interactions</li>
                <li>â€¢ Error logs and performance metrics</li>
              </ul>
            </div>
          </div>
        </div>

        {/* How We Use Information */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            How We Use Your Information
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <ul className="space-y-3">
              <li>â€¢ <strong>Music Analysis:</strong> Process audio to detect chords, beats, and synchronize lyrics</li>
              <li>â€¢ <strong>Performance Optimization:</strong> Cache analysis results to improve response times</li>
              <li>â€¢ <strong>Research Purposes:</strong> Aggregate usage data to improve machine learning models</li>
              <li>â€¢ <strong>Service Improvement:</strong> Analyze usage patterns to enhance user experience</li>
              <li>â€¢ <strong>Technical Support:</strong> Diagnose and resolve technical issues</li>
            </ul>
          </div>
        </div>

        {/* Data Storage and Security */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Data Storage and Security
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
                Security Measures
              </h3>
              <ul className="space-y-2">
                <li>â€¢ All data transmission is encrypted using HTTPS</li>
                <li>â€¢ Analysis results are cached using Persistence with security rules</li>
                <li>â€¢ Audio files are processed temporarily and not permanently stored</li>
                <li>â€¢ Access to data is restricted to authorized research personnel</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Third-Party Services */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Third-Party Services
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>ChordMini integrates with the following third-party services:</p>
            <ul className="space-y-3">
              <li>â€¢ <strong>YouTube API:</strong> For video metadata and audio extraction</li>
              <li>â€¢ <strong>Persistence:</strong> For caching and data storage</li>
              <li>â€¢ <strong>LRCLIB API:</strong> For lyrics retrieval and synchronization</li>
              <li>â€¢ <strong>LRClib:</strong> For synchronized lyrics</li>
              <li>â€¢ <strong>Google Cloud:</strong> For machine learning model hosting</li>
            </ul>
            <p>Each service has its own privacy policy that governs their data handling practices.</p>
          </div>
        </div>

        {/* Your Rights */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Your Rights
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>You have the right to:</p>
            <ul className="space-y-2">
              <li>â€¢ Request information about data we have collected</li>
              <li>â€¢ Request deletion of your cached analysis results</li>
              <li>â€¢ Opt out of data collection for research purposes</li>
              <li>â€¢ Report privacy concerns or data breaches</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PrivacyPage;
