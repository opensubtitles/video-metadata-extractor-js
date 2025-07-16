import React from 'react';
import { VideoMetadata } from '../types';

interface MetadataDisplayProps {
  metadata: VideoMetadata | null;
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({ metadata }) => {
  if (!metadata) return null;


  const formatFileSize = (bytes: string): string => {
    const size = parseInt(bytes);
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const parseFrameRate = (frameRate: string): string => {
    if (!frameRate) return 'N/A';
    const [num, den] = frameRate.split('/').map(Number);
    return den ? `${(num / den).toFixed(2)} fps` : 'N/A';
  };

  const MetadataItem: React.FC<{ title: string; data: Record<string, string>; priority?: boolean }> = ({ title, data, priority = false }) => (
    <div className={`
      border rounded-lg shadow-sm overflow-hidden mb-4
      ${priority ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'}
    `}>
      <div className={`
        px-4 py-3 border-b border-gray-200
        ${priority ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-800'}
      `}>
        <h3 className="font-semibold text-xs uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center">
            <span className="text-gray-600 text-sm font-medium">{key}:</span>
            <span className={`
              font-mono text-sm font-semibold
              ${priority ? 'text-orange-700' : 'text-gray-900'}
            `}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-8">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Video Metadata</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Essential Information - Priority */}
        {metadata.format ? (
          <MetadataItem
            title="Essential Information"
            priority={true}
            data={{
              'Movie Time (ms)': metadata.format.movietimems && metadata.format.movietimems !== 'unknown' ? 
                `${parseInt(metadata.format.movietimems).toLocaleString()} ms` : 'N/A',
              'Movie FPS': metadata.format.fps ? `${parseFloat(metadata.format.fps).toFixed(2)} fps` : 'N/A',
              'Movie Frames': metadata.format.movieframes && metadata.format.movieframes !== 'unknown' ? 
                `${parseInt(metadata.format.movieframes).toLocaleString()} frames` : 'N/A'
            }}
          />
        ) : (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
            <p>No format information available</p>
          </div>
        )}

        {/* Format Information */}
        {metadata.format && (
          <MetadataItem
            title="Format Information"
            data={{
              'Filename': metadata.format.filename || 'N/A',
              'Format': metadata.format.format_name || 'N/A',
              'Size': metadata.format.size ? formatFileSize(metadata.format.size) : 'N/A',
              'Bitrate': metadata.format.bit_rate ? `${Math.round(parseInt(metadata.format.bit_rate) / 1000)} kbps` : 'N/A'
            }}
          />
        )}

        {/* Stream Information */}
        {metadata.streams?.map((stream, index) => {
          const streamType = stream.codec_type.charAt(0).toUpperCase() + stream.codec_type.slice(1);
          const streamInfo: Record<string, string> = {
            'Type': streamType,
            'Codec': stream.codec_name || 'N/A',
            'Profile': stream.profile || 'N/A'
          };

          if (stream.codec_type === 'video') {
            streamInfo['Resolution'] = stream.width && stream.height ? `${stream.width}x${stream.height}` : 'N/A';
            streamInfo['Frame Rate'] = stream.r_frame_rate ? parseFrameRate(stream.r_frame_rate) : 'N/A';
            streamInfo['Pixel Format'] = stream.pix_fmt || 'N/A';
            streamInfo['Bitrate'] = stream.bit_rate ? `${Math.round(parseInt(stream.bit_rate) / 1000)} kbps` : 'N/A';
          } else if (stream.codec_type === 'audio') {
            streamInfo['Sample Rate'] = stream.sample_rate ? `${stream.sample_rate} Hz` : 'N/A';
            streamInfo['Channels'] = stream.channels ? stream.channels.toString() : 'N/A';
            streamInfo['Bitrate'] = stream.bit_rate ? `${Math.round(parseInt(stream.bit_rate) / 1000)} kbps` : 'N/A';
          }

          return (
            <MetadataItem
              key={index}
              title={`${streamType} Stream ${index + 1}`}
              data={streamInfo}
            />
          );
        })}
      </div>
    </div>
  );
};