/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef NATIVE_WITH_STATE_INTERNAL_MEDIA_API_CLIENT_H_
#define NATIVE_WITH_STATE_INTERNAL_MEDIA_API_CLIENT_H_

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "absl/base/thread_annotations.h"
#include "absl/container/flat_hash_map.h"
#include "absl/container/flat_hash_set.h"
#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "absl/synchronization/mutex.h"
#include "native_with_state/api/media_api_client_interface.h"
#include "native_with_state/internal/conference_data_channel_interface.h"
#include "native_with_state/internal/conference_media_tracks.h"
#include "native_with_state/internal/conference_peer_connection_interface.h"
#include "webrtc/api/rtp_transceiver_interface.h"
#include "webrtc/api/scoped_refptr.h"
#include "webrtc/rtc_base/thread.h"

namespace meet {

class MediaApiClient : public MediaApiClientInterface {
 public:
  // Container for data channels used by the client.
  struct ConferenceDataChannels {
    std::unique_ptr<ConferenceDataChannelInterface> media_entries;
    std::unique_ptr<ConferenceDataChannelInterface> media_stats;
    std::unique_ptr<ConferenceDataChannelInterface> participants;
    std::unique_ptr<ConferenceDataChannelInterface> session_control;
    std::unique_ptr<ConferenceDataChannelInterface> video_assignment;
  };

  MediaApiClient(std::unique_ptr<rtc::Thread> client_thread,
                 rtc::scoped_refptr<MediaApiClientObserverInterface> observer,
                 std::unique_ptr<ConferencePeerConnectionInterface>
                     conference_peer_connection,
                 ConferenceDataChannels data_channels)
      : client_thread_(std::move(client_thread)),
        observer_(std::move(observer)),
        conference_peer_connection_(std::move(conference_peer_connection)),
        data_channels_(std::move(data_channels)) {
    conference_peer_connection_->SetDisconnectCallback(
        std::bind_front(&MediaApiClient::MaybeDisconnect, this));
    conference_peer_connection_->SetTrackSignaledCallback(
        std::bind_front(&MediaApiClient::HandleTrackSignaled, this));

    data_channels_.media_entries->SetCallback(
        std::bind_front(&MediaApiClient::HandleResourceUpdate, this));
    data_channels_.media_stats->SetCallback(
        std::bind_front(&MediaApiClient::HandleResourceUpdate, this));
    data_channels_.participants->SetCallback(
        std::bind_front(&MediaApiClient::HandleResourceUpdate, this));
    data_channels_.session_control->SetCallback(
        std::bind_front(&MediaApiClient::HandleResourceUpdate, this));
    data_channels_.video_assignment->SetCallback(
        std::bind_front(&MediaApiClient::HandleResourceUpdate, this));
  }

  ~MediaApiClient() override {
    // Close the peer connection to prevent any further callbacks from WebRTC
    // objects. This prevents null dereferences on client objects after the
    // client has started to be destroyed.
    //
    // Note that destroying the peer connection also closes it, but this client
    // implementation closes the peer connection explicitly rather than relying
    // on implicit destructor behavior.
    conference_peer_connection_->Close();
  }

  absl::Status ConnectActiveConference(absl::string_view join_endpoint,
                                       absl::string_view conference_id,
                                       absl::string_view access_token) override;
  absl::Status LeaveConference(int64_t request_id) override;
  absl::Status SendRequest(const ResourceRequest& request) override;

 private:
  // TODO: Add links to devsite documentation.
  enum class State { kReady, kConnecting, kJoining, kJoined, kDisconnected };

  // Configuration for collecting stats.
  //
  // TODO: Add links to devsite documentation.
  struct StatsConfig {
    // Id to use when sending stats requests.
    //
    // This client implementation uses a simple incrementing counter to generate
    // IDs.
    int64_t stats_request_id;
    // Interval between stats requests.
    //
    // An interval of 0 indicates that stats collection is disabled.
    //
    // Provided to client by `MediaStatsChannelToClient` resource update.
    int32_t upload_interval = 0;
    // Allowlist for values in RTCStatsReport to include in
    // `MediaStatsChannelFromClient` resource requests.
    //
    // Provided to client by `MediaStatsChannelToClient` resource update.
    absl::flat_hash_map<std::string, absl::flat_hash_set<std::string>>
        allowlist;
  };

  std::string StateToString(State state) {
    switch (state) {
      case State::kReady:
        return "ready";
      case State::kConnecting:
        return "connecting";
      case State::kJoining:
        return "joining";
      case State::kJoined:
        return "joined";
      case State::kDisconnected:
        return "disconnected";
    }
  }

  // Handles resource updates from Meet servers.
  //
  // Resources may be received while in the joining and joined states.
  void HandleResourceUpdate(ResourceUpdate update);
  void HandleTrackSignaled(
      rtc::scoped_refptr<webrtc::RtpTransceiverInterface> transceiver);
  // Collects stats from the peer connection, sends them to Meet servers, and
  // schedules the next stats collection.
  void CollectStats();
  // Disconnects the client if it has not already been disconnected.
  void MaybeDisconnect(absl::Status status);

  absl::Mutex mutex_;
  State state_ ABSL_GUARDED_BY(mutex_) = State::kReady;
  StatsConfig stats_config_;

  // Internal thread for client initiated asynchronous behavior.
  std::unique_ptr<rtc::Thread> client_thread_;
  rtc::scoped_refptr<MediaApiClientObserverInterface> observer_;
  std::unique_ptr<ConferencePeerConnectionInterface>
      conference_peer_connection_;
  ConferenceDataChannels data_channels_;
  std::vector<ConferenceMediaTrack> media_tracks_;
};

}  // namespace meet

#endif  // NATIVE_WITH_STATE_INTERNAL_MEDIA_API_CLIENT_H_
