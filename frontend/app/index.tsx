import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const { width, height } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function LoginScreen() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    checkExistingLogin();
  }, []);

  const checkExistingLogin = async () => {
    try {
      const savedDevice = await AsyncStorage.getItem('xow_device');
      if (savedDevice) {
        router.replace('/recorder');
      }
    } catch (error) {
      console.log('No existing login');
    }
  };

  const handleLogin = async () => {
    if (!deviceId.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter Device ID and Password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        device_id: deviceId.trim(),
        password: password.trim(),
      });

      if (response.data.success) {
        await AsyncStorage.setItem('xow_device', JSON.stringify(response.data.device));
        router.replace('/recorder');
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.response?.data?.detail || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!deviceId.trim() || !password.trim() || !deviceName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/register`, {
        device_id: deviceId.trim(),
        password: password.trim(),
        name: deviceName.trim(),
      });
      Alert.alert('Success', 'Device registered! You can now login.');
      setIsRegistering(false);
      setDeviceName('');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.response?.data?.detail || 'Could not register');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Background Grid Pattern */}
      <View style={styles.gridPattern}>
        {[...Array(20)].map((_, i) => (
          <View key={i} style={styles.gridLine} />
        ))}
      </View>

      {/* Left Panel - Branding */}
      <View style={styles.leftPanel}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBox}>
            <Ionicons name="videocam" size={48} color="#fff" />
          </View>
          <Text style={styles.brandName}>XoW</Text>
          <Text style={styles.brandTagline}>Professional Booth Recording System</Text>
        </View>
        
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <Ionicons name="recording" size={20} color="#7C3AED" />
            <Text style={styles.featureText}>HD Video Recording</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="barcode" size={20} color="#7C3AED" />
            <Text style={styles.featureText}>Visitor Tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="cloud-upload" size={20} color="#7C3AED" />
            <Text style={styles.featureText}>Cloud Sync</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="analytics" size={20} color="#7C3AED" />
            <Text style={styles.featureText}>AI Analytics</Text>
          </View>
        </View>

        <Text style={styles.version}>v1.0.0</Text>
      </View>

      {/* Right Panel - Login Form */}
      <View style={styles.rightPanel}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{isRegistering ? 'Register Device' : 'Device Login'}</Text>
          <Text style={styles.formSubtitle}>
            {isRegistering ? 'Setup a new recording device' : 'Enter your device credentials'}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DEVICE ID</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="hardware-chip-outline" size={20} color="#7C3AED" />
              <TextInput
                style={styles.input}
                placeholder="Enter device ID"
                placeholderTextColor="#4B5563"
                value={deviceId}
                onChangeText={setDeviceId}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#7C3AED" />
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor="#4B5563"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          {isRegistering && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BOOTH NAME</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="business-outline" size={20} color="#7C3AED" />
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Tech Expo - Booth A1"
                  placeholderTextColor="#4B5563"
                  value={deviceName}
                  onChangeText={setDeviceName}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.submitButton}
            onPress={isRegistering ? handleRegister : handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>{isRegistering ? 'Register' : 'Connect'}</Text>
                <Ionicons name="arrow-forward" size={20} color="#000" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchButton} onPress={() => setIsRegistering(!isRegistering)}>
            <Text style={styles.switchText}>
              {isRegistering ? 'Already registered? Sign in' : 'New device? Register'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0A0A0A',
  },
  gridPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    opacity: 0.03,
  },
  gridLine: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: '#fff',
  },
  leftPanel: {
    flex: 1,
    padding: 40,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1F1F1F',
  },
  brandContainer: {
    marginBottom: 40,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandName: {
    fontSize: 56,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 4,
  },
  brandTagline: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
  },
  featureList: {
    marginTop: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  featureText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  version: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    color: '#4B5563',
    fontSize: 12,
  },
  rightPanel: {
    flex: 1,
    padding: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111111',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    gap: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 12,
    gap: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    color: '#7C3AED',
    fontSize: 14,
  },
});
