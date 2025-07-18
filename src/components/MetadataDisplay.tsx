import React from 'react';
import { VideoMetadata } from '../types';

interface MetadataDisplayProps {
  metadata: VideoMetadata | null;
  selectedFile?: File | null;
  extractSubtitle?: (file: File, streamIndex: number, language?: string, codecName?: string, isForced?: boolean) => Promise<void>;
  extractStream?: (file: File, streamIndex: number, streamType: string, codecName?: string) => Promise<void>;
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({ metadata, selectedFile, extractSubtitle, extractStream }) => {
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

  const MetadataItem: React.FC<{ title: string; data: Record<string, string>; priority?: boolean }> = ({ title, data, priority = false }) => {
    // Filter out N/A, empty, null, undefined, and unknown values
    const filteredData = Object.entries(data).filter(([_, value]) => 
      value !== '' && 
      value !== null && 
      value !== undefined && 
      value !== 'N/A' && 
      value !== 'unknown'
    );
    
    // Don't render if no data to show
    if (filteredData.length === 0) return null;
    
    return (
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
          {filteredData.map(([key, value]) => (
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
  };

  return (
    <div className="mt-8">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Video Metadata</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        

        {/* Format Information */}
        {metadata.format && (
          <MetadataItem
            title="Format Information"
            data={{
              ...(metadata.format.format_name && { 'Format': metadata.format.format_name }),
              ...(metadata.format.duration && { 'Duration': metadata.format.duration }),
              ...(metadata.format.size && { 'Size': formatFileSize(metadata.format.size) }),
              ...(metadata.format.bit_rate && metadata.format.bit_rate !== 'unknown' && { 
                'Bitrate': `${Math.round(parseInt(metadata.format.bit_rate) / 1000)} kbps` 
              }),
              ...(metadata.format.fps && metadata.format.fps !== 'unknown' && { 
                'FPS': `${parseFloat(metadata.format.fps).toFixed(2)} fps` 
              }),
              ...(metadata.format.movietimems && metadata.format.movietimems !== 'unknown' && { 
                'Movie Time (ms)': `${parseInt(metadata.format.movietimems).toLocaleString()} ms` 
              }),
              ...(metadata.format.movieframes && metadata.format.movieframes !== 'unknown' && { 
                'Movie Frames': `${parseInt(metadata.format.movieframes).toLocaleString()} frames` 
              })
            }}
          />
        )}

        {/* Stream Information */}
        {metadata.streams?.map((stream, index) => {
          const streamType = stream.codec_type.charAt(0).toUpperCase() + stream.codec_type.slice(1);
          const streamInfo: Record<string, string> = {
            'Index': stream.index !== undefined ? stream.index.toString() : index.toString(),
            'Type': streamType,
            ...(stream.codec_name && { 'Codec': stream.codec_name }),
            ...(stream.profile && { 'Profile': stream.profile })
          };


          if (stream.codec_type === 'video') {
            if (stream.width && stream.height) {
              streamInfo['Resolution'] = `${stream.width}x${stream.height}`;
              streamInfo['Width'] = stream.width.toString();
              streamInfo['Height'] = stream.height.toString();
            }
            if (stream.r_frame_rate) {
              const frameRate = parseFrameRate(stream.r_frame_rate);
              if (frameRate !== 'N/A') streamInfo['Frame Rate'] = frameRate;
            }
            if (stream.avg_frame_rate) {
              const avgFrameRate = parseFrameRate(stream.avg_frame_rate);
              if (avgFrameRate !== 'N/A') streamInfo['Avg Frame Rate'] = avgFrameRate;
            }
            if (stream.pix_fmt) streamInfo['Pixel Format'] = stream.pix_fmt;
            if (stream.bit_rate && stream.bit_rate !== 'unknown') {
              streamInfo['Bitrate'] = `${Math.round(parseInt(stream.bit_rate) / 1000)} kbps`;
            }
            if (stream.duration) streamInfo['Duration'] = stream.duration;
            if (stream.nb_frames) streamInfo['Frame Count'] = stream.nb_frames;
            if (stream.level) streamInfo['Level'] = stream.level;
            if (stream.codec_tag) streamInfo['Codec Tag'] = stream.codec_tag;
            if (stream.codec_tag_string) streamInfo['Codec Tag String'] = stream.codec_tag_string;
            if (stream.codec_long_name) streamInfo['Codec Long Name'] = stream.codec_long_name;
          } else if (stream.codec_type === 'audio') {
            if (stream.sample_rate) streamInfo['Sample Rate'] = `${stream.sample_rate} Hz`;
            if (stream.channels) streamInfo['Channels'] = stream.channels.toString();
            if (stream.channel_layout) streamInfo['Channel Layout'] = stream.channel_layout;
            if (stream.bit_rate && stream.bit_rate !== 'unknown') {
              streamInfo['Bitrate'] = `${Math.round(parseInt(stream.bit_rate) / 1000)} kbps`;
            }
            if (stream.duration) streamInfo['Duration'] = stream.duration;
            if (stream.level) streamInfo['Level'] = stream.level;
            if (stream.codec_tag) streamInfo['Codec Tag'] = stream.codec_tag;
            if (stream.codec_tag_string) streamInfo['Codec Tag String'] = stream.codec_tag_string;
            if (stream.codec_long_name) streamInfo['Codec Long Name'] = stream.codec_long_name;
          } else if (stream.codec_type === 'subtitle') {
            if (stream.language) streamInfo['Language'] = stream.language;
            if (stream.title) streamInfo['Title'] = stream.title;
            streamInfo['Default'] = stream.default ? 'Yes' : 'No';
            streamInfo['Forced'] = stream.forced ? 'Yes' : 'No';
            if (stream.duration) streamInfo['Duration'] = stream.duration;
            if (stream.codec_tag) streamInfo['Codec Tag'] = stream.codec_tag;
            if (stream.codec_tag_string) streamInfo['Codec Tag String'] = stream.codec_tag_string;
            if (stream.codec_long_name) streamInfo['Codec Long Name'] = stream.codec_long_name;
          }

          const handleDownloadSubtitle = async () => {
            if (selectedFile && extractSubtitle && stream.codec_type === 'subtitle' && stream.index !== undefined) {
              await extractSubtitle(selectedFile, stream.index, stream.language, stream.codec_name, stream.forced);
            }
          };

          const handleDownloadStream = async () => {
            const streamIndex = stream.index !== undefined ? stream.index : index;
            
            if (selectedFile && extractStream && (stream.codec_type === 'video' || stream.codec_type === 'audio')) {
              await extractStream(selectedFile, streamIndex, stream.codec_type, stream.codec_name);
            }
          };

          return (
            <div key={index} className="relative">
              <MetadataItem
                title={`${streamType} Stream ${index + 1}`}
                data={streamInfo}
              />
              {stream.codec_type === 'subtitle' && selectedFile && extractSubtitle && (
                <button
                  onClick={handleDownloadSubtitle}
                  className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors"
                  title="Download subtitle file"
                >
                  Download
                </button>
              )}
              {(stream.codec_type === 'video' || stream.codec_type === 'audio') && selectedFile && extractStream && (
                <button
                  onClick={handleDownloadStream}
                  className="absolute top-2 right-2 bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors"
                  title={`Download ${stream.codec_type} stream`}
                >
                  Download
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};